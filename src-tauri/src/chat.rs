//! Claude Code run headless over stream-json. The background host runs the chats; the webview
//! owns the protocol. Here: its flags, its models, and the transcripts it keeps.

use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};

use crate::git::tool_path;

/// The flags Claude Code's own SDK passes; `resume` picks a transcript back up.
pub fn claude_args(resume: Option<&str>, model: Option<&str>, effort: Option<&str>) -> Vec<String> {
    let mut args: Vec<String> = [
        "--output-format",
        "stream-json",
        "--input-format",
        "stream-json",
        "--verbose",
        "--include-partial-messages",
        "--permission-prompt-tool",
        "stdio",
        "--thinking-display",
        "summarized",
    ]
    .map(String::from)
    .to_vec();
    for (flag, value) in [("--model", model), ("--effort", effort)] {
        if let Some(value) = value.filter(|v| !v.is_empty()) {
            args.push(flag.into());
            args.push(value.into());
        }
    }
    if let Some(id) = resume.filter(|id| !id.is_empty()) {
        args.push("--resume".into());
        args.push(id.into());
    }
    args
}

/// `claude` in `cwd` with every stdio piped.
/// Claude Code's `Artifact` tool, always on. Claude Code would also open each new artifact in
/// the default browser: the app's panel shows it instead.
const ARTIFACT_ENV: [(&str, &str); 2] = [
    ("CLAUDE_CODE_ARTIFACT", "1"),
    ("CLAUDE_CODE_ARTIFACT_AUTO_OPEN", "0"),
];

/// aimux's own MCP server (`aimux --mcp <chat>`, this binary) for chat `chat`, its tools
/// allowed without asking: what they do (workspaces, prompts) shows in the window.
fn aimux_mcp(chat: Option<&str>) -> Vec<String> {
    let (Ok(exe), Some(chat)) = (std::env::current_exe(), chat) else {
        return Vec::new();
    };
    let config = serde_json::json!({
        "mcpServers": { "aimux": { "command": exe, "args": ["--mcp", chat] } }
    });
    vec![
        "--mcp-config".into(),
        config.to_string(),
        "--allowedTools".into(),
        "mcp__aimux".into(),
    ]
}

/// `chat`: the aimux chat it runs, which then gets aimux's MCP server.
pub fn spawn_claude(cwd: &str, args: Vec<String>, chat: Option<&str>) -> Result<Child, String> {
    let mut cmd = Command::new("claude");
    cmd.args(args)
        .args(aimux_mcp(chat))
        .current_dir(cwd)
        .env("PATH", tool_path())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    // Launched from inside a Claude Code session, the child would take itself for a sub-session.
    for (key, _) in std::env::vars() {
        if key == "CLAUDECODE" || key.starts_with("CLAUDE_CODE_") {
            cmd.env_remove(key);
        }
    }
    cmd.envs(ARTIFACT_ENV);
    // Compacts by itself past the size Settings picked, instead of filling the 1M window.
    if let Some(tokens) = crate::store::compact_window() {
        cmd.env("CLAUDE_CODE_AUTO_COMPACT_WINDOW", tokens.to_string());
    }
    cmd.spawn().map_err(|e| format!("claude: {e}"))
}

/// Claude Code's `initialize` answer (JSON): the models it offers and its `/` commands. A
/// headless Claude starts, answers, and is stopped: no turn is run, nothing reaches the API.
#[tauri::command(async)]
pub fn claude_models() -> Result<String, String> {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/".into());
    // Its stderr pipe is never read: the little it prints before the answer fits the buffer.
    let mut child = spawn_claude(&home, claude_args(None, None, None), None)?;
    let mut stdin = child.stdin.take().ok_or("claude: no stdin")?;
    let stdout = child.stdout.take().ok_or("claude: no stdout")?;
    let asked = writeln!(
        stdin,
        r#"{{"type":"control_request","request_id":"models","request":{{"subtype":"initialize"}}}}"#
    );
    let mut found = None;
    if asked.is_ok() {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            let Ok(message) = serde_json::from_str::<serde_json::Value>(&line) else {
                continue;
            };
            if message["type"] == "control_response" {
                found = Some(message["response"]["response"].to_string());
                break;
            }
        }
    }
    let _ = child.kill();
    let _ = child.wait();
    found.ok_or_else(|| "Claude Code did not answer initialize.".into())
}

/// The transcript Claude Code keeps for `session_id`, one JSON object per line, so a chat
/// reopened after a restart shows what was said. Claude names the folder after the cwd.
#[tauri::command(async)]
pub fn chat_history(session_id: String) -> Result<Vec<String>, String> {
    let file = transcript_file(&session_id)?;
    let raw = std::fs::read_to_string(&file).map_err(|e| e.to_string())?;
    let mut lines: Vec<String> = raw
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(String::from)
        .collect();
    lines.extend(agent_lines(&file.with_extension("").join("subagents")));
    Ok(lines)
}

/// Where Claude Code keeps session `session_id`'s transcript.
pub fn transcript_file(session_id: &str) -> Result<std::path::PathBuf, String> {
    if session_id.is_empty()
        || !session_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-')
    {
        return Err("bad session id".into());
    }
    let home = std::env::var("HOME").unwrap_or_default();
    let root = std::env::var("CLAUDE_CONFIG_DIR")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| std::path::Path::new(&home).join(".claude"))
        .join("projects");
    std::fs::read_dir(&root)
        .map_err(|e| e.to_string())?
        .flatten()
        .map(|dir| dir.path().join(format!("{session_id}.jsonl")))
        .find(|f| f.exists())
        .ok_or_else(|| "no transcript for this chat".into())
}

/// The sub-agents' transcripts Claude Code keeps beside a session's (`subagents/agent-*.jsonl`,
/// each with a `.meta.json` naming the call that started it): every line tagged with that
/// call's id as `aimuxAgent`.
fn agent_lines(dir: &std::path::Path) -> Vec<String> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut lines = Vec::new();
    for path in entries.flatten().map(|e| e.path()) {
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        let Some(agent) = name.strip_suffix(".meta.json") else {
            continue;
        };
        let meta: serde_json::Value = std::fs::read_to_string(&path)
            .ok()
            .and_then(|m| serde_json::from_str(&m).ok())
            .unwrap_or_default();
        let Some(call) = meta["toolUseId"].as_str() else {
            continue;
        };
        let Ok(raw) = std::fs::read_to_string(dir.join(format!("{agent}.jsonl"))) else {
            continue;
        };
        for line in raw.lines() {
            if let Ok(serde_json::Value::Object(mut m)) = serde_json::from_str(line) {
                m.insert("aimuxAgent".into(), call.into());
                lines.push(serde_json::Value::Object(m).to_string());
            }
        }
    }
    lines
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn agent_lines_tag_each_line_with_its_call() {
        let dir = std::env::temp_dir().join(format!("aimux-agents-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("agent-a1.meta.json"), r#"{"toolUseId":"toolu_1"}"#).unwrap();
        std::fs::write(
            dir.join("agent-a1.jsonl"),
            "{\"type\":\"user\"}\nnot json\n",
        )
        .unwrap();
        std::fs::write(dir.join("agent-a2.jsonl"), "{\"type\":\"user\"}\n").unwrap();
        let lines = agent_lines(&dir);
        std::fs::remove_dir_all(&dir).unwrap();
        assert_eq!(lines, [r#"{"aimuxAgent":"toolu_1","type":"user"}"#]);
        assert!(agent_lines(std::path::Path::new("/nope")).is_empty());
    }

    #[test]
    fn resume_only_with_an_id() {
        assert!(!claude_args(None, None, None).contains(&"--resume".to_string()));
        assert!(!claude_args(Some(""), None, None).contains(&"--resume".to_string()));
        let args = claude_args(Some("abc"), None, None);
        assert_eq!(&args[args.len() - 2..], ["--resume", "abc"]);
    }

    #[test]
    fn model_and_effort_only_when_chosen() {
        let args = claude_args(None, Some("opus"), Some(""));
        assert!(args.windows(2).any(|w| w == ["--model", "opus"]));
        assert!(!args.contains(&"--effort".to_string()));
    }
}
