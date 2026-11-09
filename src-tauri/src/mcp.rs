//! `aimux --mcp <chat>`: the app's MCP server, over stdio, for the Claude of one aimux chat.
//! It lets that agent orchestrate: start workspaces with a prompt, follow their chats, wait for
//! them and read what they answered. Reading comes from the catalog, the host's chat states and
//! Claude Code's transcripts; creating and sending go through the window (via the host's
//! socket, never TCP), so everything shows in the sidebar as if the user had done it.

use std::collections::HashSet;
use std::io::{BufRead, BufReader, Write};
use std::os::unix::net::UnixStream;
use std::time::{Duration, Instant};

use serde_json::{json, Value};

use crate::host::HostChat;
use crate::store::{self, Catalog, ChatRecord, Workspace};

const SERVER: &str = "aimux";
/// How many workspaces one chat may create.
const MAX_CREATED: usize = 5;
const DEFAULT_WAIT: u64 = 600;
const MAX_WAIT: u64 = 1800;
const POLL: Duration = Duration::from_secs(2);
/// A workspace this young that has not been seen working yet is still starting.
const STARTING: Duration = Duration::from_secs(30);
/// How much of an answer `wait_for` quotes.
const EXCERPT: usize = 1500;

/// Serves MCP on stdin/stdout until stdin closes.
pub fn run(chat: String) {
    let stdin = std::io::stdin();
    let mut out = std::io::stdout();
    for line in stdin.lock().lines().map_while(Result::ok) {
        let Ok(msg) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        if let Some(reply) = answer(&chat, &msg) {
            let _ = writeln!(out, "{reply}");
            let _ = out.flush();
        }
    }
}

/// The reply to one JSON-RPC message; None for a notification.
fn answer(chat: &str, msg: &Value) -> Option<Value> {
    let id = msg.get("id")?.clone();
    let result = match msg["method"].as_str().unwrap_or_default() {
        "initialize" => Ok(json!({
            "protocolVersion": msg["params"]["protocolVersion"].as_str().unwrap_or("2025-06-18"),
            "capabilities": { "tools": {} },
            "serverInfo": { "name": SERVER, "version": env!("CARGO_PKG_VERSION") },
            "instructions": INSTRUCTIONS,
        })),
        "ping" => Ok(json!({})),
        "tools/list" => Ok(json!({ "tools": tools() })),
        "tools/call" => Ok(call(chat, &msg["params"])),
        other => Err(format!("unknown method {other}")),
    };
    Some(match result {
        Ok(result) => json!({ "jsonrpc": "2.0", "id": id, "result": result }),
        Err(message) => {
            json!({ "jsonrpc": "2.0", "id": id, "error": { "code": -32601, "message": message } })
        }
    })
}

const INSTRUCTIONS: &str = "aimux runs this chat in a workspace: a git worktree of a project, \
shown in the user's sidebar. Other workspaces of the same project each run their own Claude. \
To split work, start workspaces with workspace_create (each gets its own branch and an agent \
working on the prompt), then wait_for them and read their answers with chat_read. \
Workspaces are named by a colour (e.g. amber); tools take that name.";

fn tools() -> Value {
    let workspace =
        json!({ "type": "string", "description": "A workspace's name (e.g. amber) or id." });
    json!([
        {
            "name": "where_am_i",
            "description": "This chat's workspace: project, workspace name, branch, base, path.",
            "inputSchema": { "type": "object", "properties": {} },
        },
        {
            "name": "list_workspaces",
            "description": "The project's workspaces: name, task, branch, and their agent's state (working, waiting = blocked on a question for the user, idle = done or not started), and which ones this chat created.",
            "inputSchema": { "type": "object", "properties": {} },
        },
        {
            "name": "workspace_create",
            "description": format!("Starts a new workspace (a worktree on its own branch) with an agent working on `prompt`, as the user's New workspace does. It shows in the user's sidebar. The prompt must stand alone: that agent knows nothing of this conversation. At most {MAX_CREATED} per chat. Follow with wait_for."),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "prompt": { "type": "string", "description": "The whole task for the new agent." },
                    "base": { "type": "string", "description": "Branch to fork from (default: the repo's default branch)." },
                    "model": { "type": "string", "description": "Claude Code model alias or id (default: the user's last pick)." },
                    "effort": { "type": "string", "enum": ["low", "medium", "high", "xhigh", "max"] },
                },
                "required": ["prompt"],
            },
        },
        {
            "name": "chat_read",
            "description": "Reads a workspace's chat: its last `turns` exchanges (prompt and answer, tool calls left out), and its state.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "workspace": workspace,
                    "turns": { "type": "integer", "description": "How many last exchanges (default 1)." },
                },
                "required": ["workspace"],
            },
        },
        {
            "name": "wait_for",
            "description": format!("Waits until the given workspaces' agents stop working (done, or waiting on the user), or `timeout_s` passes (default {DEFAULT_WAIT}, at most {MAX_WAIT}). Returns each one's state and the end of its last answer."),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "workspaces": { "type": "array", "items": { "type": "string" }, "description": "Names or ids." },
                    "any": { "type": "boolean", "description": "Return as soon as one of them stops (default: all)." },
                    "timeout_s": { "type": "integer" },
                },
                "required": ["workspaces"],
            },
        },
        {
            "name": "chat_send",
            "description": "Sends a follow-up prompt to the agent of a workspace this chat created. The user sees it in that chat.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "workspace": workspace,
                    "text": { "type": "string" },
                },
                "required": ["workspace", "text"],
            },
        },
    ])
}

fn call(chat: &str, params: &Value) -> Value {
    let args = &params["arguments"];
    let result = match params["name"].as_str().unwrap_or_default() {
        "where_am_i" => where_am_i(),
        "list_workspaces" => list_workspaces(chat),
        "workspace_create" => workspace_create(chat, args),
        "chat_read" => chat_read(args),
        "wait_for" => wait_for(args),
        "chat_send" => chat_send(chat, args),
        other => Err(format!("no tool {other}")),
    };
    match result {
        Ok(text) => json!({ "content": [{ "type": "text", "text": text }] }),
        Err(e) => json!({ "content": [{ "type": "text", "text": e }], "isError": true }),
    }
}

// Where this chat runs: the workspace whose worktree holds the current folder.

struct Here {
    catalog: Catalog,
    workspace: Workspace,
}

fn here() -> Result<Here, String> {
    let cwd = std::env::current_dir().map_err(|e| e.to_string())?;
    let catalog = store::saved_catalog();
    let workspace = workspace_of(&catalog, &cwd.to_string_lossy())
        .ok_or("this chat is not in an aimux workspace")?
        .clone();
    Ok(Here { catalog, workspace })
}

/// The workspace whose path is `dir` or holds it (the deepest, should they nest).
fn workspace_of<'a>(catalog: &'a Catalog, dir: &str) -> Option<&'a Workspace> {
    catalog
        .workspaces
        .iter()
        .filter(|w| dir == w.path || dir.starts_with(&format!("{}/", w.path.trim_end_matches('/'))))
        .max_by_key(|w| w.path.len())
}

impl Here {
    fn siblings(&self) -> impl Iterator<Item = &Workspace> {
        self.catalog
            .workspaces
            .iter()
            .filter(|w| w.project_id == self.workspace.project_id)
    }

    /// A workspace of this project, by id or name.
    fn find(&self, key: &str) -> Result<&Workspace, String> {
        let key = key.trim();
        self.siblings()
            .find(|w| w.id == key || w.name.eq_ignore_ascii_case(key))
            .ok_or_else(|| format!("no workspace {key} in this project (see list_workspaces)"))
    }

    fn chats_of(&self, workspace: &str) -> Vec<&ChatRecord> {
        let mut chats: Vec<&ChatRecord> = self
            .catalog
            .chats
            .iter()
            .filter(|c| c.workspace_id == workspace)
            .collect();
        chats.sort_by_key(|c| c.created_at);
        chats
    }

    /// The chat that matters in a workspace: the one last active.
    fn main_chat(&self, workspace: &str) -> Option<&ChatRecord> {
        self.chats_of(workspace)
            .into_iter()
            .max_by_key(|c| (c.active_at, c.created_at))
    }
}

fn where_am_i() -> Result<String, String> {
    let h = here()?;
    let w = &h.workspace;
    let project = h
        .catalog
        .projects
        .iter()
        .find(|p| p.id == w.project_id)
        .map(|p| p.name.clone());
    Ok(json!({
        "project": project,
        "workspace": w.name,
        "branch": w.branch,
        "base": w.base,
        "path": w.path,
    })
    .to_string())
}

// The host, over its socket.

fn ask_host(request: &Value) -> Result<Value, String> {
    let mut s = UnixStream::connect(store::data_dir().join("host.sock"))
        .map_err(|_| "aimux is not running: ask the user to open it.".to_string())?;
    writeln!(s, "{request}").map_err(|e| e.to_string())?;
    let mut line = String::new();
    BufReader::new(&s)
        .read_line(&mut line)
        .map_err(|e| e.to_string())?;
    let v: Value = serde_json::from_str(&line)
        .map_err(|_| "aimux's background host did not answer.".to_string())?;
    match v["error"].as_str() {
        Some(e) => Err(e.into()),
        None => Ok(v),
    }
}

fn peek() -> Result<Vec<HostChat>, String> {
    serde_json::from_value(ask_host(&json!({ "op": "peek" }))?["chats"].clone())
        .map_err(|e| e.to_string())
}

/// What a workspace's agent is doing: `waiting` (on the user) above `working` above `idle`.
fn state_of(h: &Here, workspace: &str, chats: &[HostChat]) -> &'static str {
    let ids: HashSet<&str> = h
        .chats_of(workspace)
        .iter()
        .map(|c| c.id.as_str())
        .collect();
    let (mut working, mut waiting) = (false, false);
    for c in chats
        .iter()
        .filter(|c| c.alive && ids.contains(c.id.as_str()))
    {
        working |= c.working;
        waiting |= c.waiting;
    }
    if waiting {
        "waiting"
    } else if working {
        "working"
    } else {
        "idle"
    }
}

fn list_workspaces(chat: &str) -> Result<String, String> {
    let h = here()?;
    let chats = peek().unwrap_or_default();
    let rows: Vec<Value> = h
        .siblings()
        .map(|w| {
            let task = h
                .chats_of(&w.id)
                .first()
                .map(|c| c.title.clone())
                .filter(|t| t != "New chat");
            json!({
                "name": w.name,
                "id": w.id,
                "task": task,
                "branch": w.branch,
                "state": state_of(&h, &w.id, &chats),
                "thisChat": w.id == h.workspace.id,
                "createdByThisChat": w.parent_chat.as_deref() == Some(chat),
            })
        })
        .collect();
    Ok(Value::Array(rows).to_string())
}

fn workspace_create(chat: &str, args: &Value) -> Result<String, String> {
    let prompt = args["prompt"].as_str().unwrap_or_default().trim();
    if prompt.is_empty() {
        return Err("give the new agent a prompt".into());
    }
    let h = here()?;
    let created = h
        .catalog
        .workspaces
        .iter()
        .filter(|w| w.parent_chat.as_deref() == Some(chat))
        .count();
    if created >= MAX_CREATED {
        return Err(format!(
            "this chat already created {MAX_CREATED} workspaces, the most it may"
        ));
    }
    let made = ask_host(&json!({ "op": "ask", "ask": {
        "op": "workspace_create",
        "projectId": h.workspace.project_id,
        "prompt": prompt,
        "base": args["base"].as_str(),
        "model": args["model"].as_str(),
        "effort": args["effort"].as_str(),
        "parentChat": chat,
    }}))?;
    Ok(json!({
        "workspace": made["name"],
        "branch": made["branch"],
        "path": made["path"],
        "next": "Its agent is working on the prompt: wait_for it, then chat_read it.",
    })
    .to_string())
}

fn chat_read(args: &Value) -> Result<String, String> {
    let h = here()?;
    let w = h.find(args["workspace"].as_str().unwrap_or_default())?;
    let turns = args["turns"].as_u64().unwrap_or(1).max(1) as usize;
    let state = state_of(&h, &w.id, &peek().unwrap_or_default());
    let text = match last_exchanges(&h, &w.id, turns) {
        Some(ex) if !ex.is_empty() => ex
            .iter()
            .map(|(prompt, answer)| {
                let answer = if answer.is_empty() {
                    "(no answer yet)"
                } else {
                    answer
                };
                format!("## Prompt\n{prompt}\n\n## Answer\n{answer}")
            })
            .collect::<Vec<_>>()
            .join("\n\n"),
        _ => "(nothing said yet)".into(),
    };
    Ok(format!("Workspace {} (agent {state})\n\n{text}", w.name))
}

fn last_exchanges(h: &Here, workspace: &str, n: usize) -> Option<Vec<(String, String)>> {
    let session = h.main_chat(workspace)?.session_id.clone()?;
    let raw = std::fs::read_to_string(crate::chat::transcript_file(&session).ok()?).ok()?;
    let all = exchanges(&raw);
    Some(all[all.len().saturating_sub(n)..].to_vec())
}

/// A transcript's exchanges: each prompt the user typed, with the text Claude answered (tool
/// calls, thinking and tool results left out).
fn exchanges(raw: &str) -> Vec<(String, String)> {
    let mut out: Vec<(String, String)> = Vec::new();
    for line in raw.lines() {
        let Ok(m) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        if m["isMeta"] == true || m["isCompactSummary"] == true || m["isSidechain"] == true {
            continue;
        }
        let texts: Vec<&str> = match &m["message"]["content"] {
            Value::String(s) => vec![s.as_str()],
            Value::Array(blocks) => blocks
                .iter()
                .filter(|b| b["type"] == "text")
                .filter_map(|b| b["text"].as_str())
                .collect(),
            _ => continue,
        };
        let text = texts.join("\n\n");
        let text = text.trim();
        match m["type"].as_str() {
            // Slash commands and their output come as tags, not prompts.
            Some("user") if !text.is_empty() && !text.starts_with('<') => {
                out.push((text.to_string(), String::new()));
            }
            Some("assistant") if !text.is_empty() => {
                if let Some((_, answer)) = out.last_mut() {
                    if !answer.is_empty() {
                        answer.push_str("\n\n");
                    }
                    answer.push_str(text);
                }
            }
            _ => {}
        }
    }
    out
}

fn wait_for(args: &Value) -> Result<String, String> {
    let keys: Vec<&str> = args["workspaces"]
        .as_array()
        .map(|a| a.iter().filter_map(Value::as_str).collect())
        .unwrap_or_default();
    if keys.is_empty() {
        return Err("name at least one workspace".into());
    }
    let any = args["any"].as_bool().unwrap_or(false);
    let timeout = Duration::from_secs(
        args["timeout_s"]
            .as_u64()
            .unwrap_or(DEFAULT_WAIT)
            .min(MAX_WAIT),
    );
    let started = Instant::now();
    let mut seen_working: HashSet<String> = HashSet::new();
    loop {
        // Read again each time: a chat opened meanwhile counts.
        let h = here()?;
        let targets = keys
            .iter()
            .map(|k| h.find(k).cloned())
            .collect::<Result<Vec<_>, _>>()?;
        let chats = peek()?;
        let now = now_ms();
        let states: Vec<(&Workspace, &str, bool)> = targets
            .iter()
            .map(|w| {
                let state = state_of(&h, &w.id, &chats);
                if state == "working" {
                    seen_working.insert(w.id.clone());
                }
                let young = now.saturating_sub(w.created_at) < STARTING.as_millis() as u64;
                let starting = state == "idle" && young && !seen_working.contains(&w.id);
                (w, state, state != "working" && !starting)
            })
            .collect();
        let settled = states.iter().filter(|s| s.2).count();
        let done = if any {
            settled > 0
        } else {
            settled == states.len()
        };
        if done || started.elapsed() >= timeout {
            let rows: Vec<Value> = states
                .iter()
                .map(|(w, state, _)| {
                    let answer = last_exchanges(&h, &w.id, 1)
                        .and_then(|ex| ex.last().map(|e| e.1.clone()))
                        .filter(|a| !a.is_empty())
                        .map(|a| tail(&a, EXCERPT));
                    json!({ "workspace": w.name, "state": state, "lastAnswer": answer })
                })
                .collect();
            return Ok(json!({ "timedOut": !done, "workspaces": rows }).to_string());
        }
        std::thread::sleep(POLL);
    }
}

fn chat_send(chat: &str, args: &Value) -> Result<String, String> {
    let text = args["text"].as_str().unwrap_or_default().trim();
    if text.is_empty() {
        return Err("nothing to send".into());
    }
    let h = here()?;
    let w = h.find(args["workspace"].as_str().unwrap_or_default())?;
    if w.parent_chat.as_deref() != Some(chat) {
        return Err(format!(
            "{} was not created by this chat: only the user writes to it",
            w.name
        ));
    }
    let target = h.main_chat(&w.id).ok_or("that workspace has no chat")?;
    ask_host(&json!({ "op": "ask", "ask": {
        "op": "chat_send",
        "chatId": target.id,
        "text": text,
    }}))?;
    Ok(format!(
        "Sent to {}: wait_for it, then chat_read it.",
        w.name
    ))
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as u64)
}

/// The last `max` characters of `text`, cut at a line start where it can.
fn tail(text: &str, max: usize) -> String {
    let count = text.chars().count();
    if count <= max {
        return text.to_string();
    }
    let cut: String = text.chars().skip(count - max).collect();
    let cut = cut.split_once('\n').map_or(cut.as_str(), |(_, rest)| rest);
    format!("…{cut}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_deepest_workspace_holding_the_folder_is_this_chat_s() {
        let catalog: Catalog = serde_json::from_value(json!({ "workspaces": [
            { "id": "a", "projectId": "p", "name": "amber", "branch": "b", "base": "main", "path": "/wt/amber", "createdAt": 0 },
            { "id": "b", "projectId": "p", "name": "basil", "branch": "b", "base": "main", "path": "/wt/amber-2", "createdAt": 0 },
        ]}))
        .unwrap();
        assert_eq!(
            workspace_of(&catalog, "/wt/amber/src").map(|w| w.id.as_str()),
            Some("a")
        );
        assert_eq!(
            workspace_of(&catalog, "/wt/amber-2").map(|w| w.id.as_str()),
            Some("b")
        );
        assert!(workspace_of(&catalog, "/elsewhere").is_none());
    }

    #[test]
    fn it_answers_initialize_and_lists_its_tools() {
        let init = answer("c", &json!({ "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": { "protocolVersion": "2025-06-18" } })).unwrap();
        assert_eq!(init["result"]["serverInfo"]["name"], "aimux");
        let note = json!({ "jsonrpc": "2.0", "method": "notifications/initialized" });
        assert!(answer("c", &note).is_none());
        let list = answer(
            "c",
            &json!({ "jsonrpc": "2.0", "id": 2, "method": "tools/list" }),
        )
        .unwrap();
        let names: Vec<&str> = list["result"]["tools"]
            .as_array()
            .unwrap()
            .iter()
            .map(|t| t["name"].as_str().unwrap())
            .collect();
        assert_eq!(
            names,
            [
                "where_am_i",
                "list_workspaces",
                "workspace_create",
                "chat_read",
                "wait_for",
                "chat_send"
            ]
        );
    }

    #[test]
    fn exchanges_keep_prompts_and_answer_text_only() {
        let raw = [
            json!({ "type": "user", "message": { "content": "Fix the login" } }),
            json!({ "type": "assistant", "message": { "content": [{ "type": "thinking", "thinking": "hm" }, { "type": "text", "text": "Looking." }] } }),
            json!({ "type": "assistant", "message": { "content": [{ "type": "tool_use", "name": "Read" }] } }),
            json!({ "type": "user", "message": { "content": [{ "type": "tool_result", "content": "file" }] } }),
            json!({ "type": "assistant", "message": { "content": [{ "type": "text", "text": "Fixed." }] } }),
            json!({ "type": "user", "isMeta": true, "message": { "content": "caveat" } }),
            json!({ "type": "user", "message": { "content": "<command-name>/compact</command-name>" } }),
            json!({ "type": "user", "message": { "content": [{ "type": "text", "text": "Thanks" }] } }),
        ]
        .map(|v| v.to_string())
        .join("\n");
        assert_eq!(
            exchanges(&raw),
            [
                (
                    "Fix the login".to_string(),
                    "Looking.\n\nFixed.".to_string()
                ),
                ("Thanks".to_string(), String::new()),
            ]
        );
    }

    #[test]
    fn tail_keeps_the_end_from_a_line_start() {
        assert_eq!(tail("short", 10), "short");
        assert_eq!(tail("aaaa\nbbbb\ncc", 7), "…cc");
    }
}
