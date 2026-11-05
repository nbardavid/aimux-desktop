//! Claude Code run headless: its stream-json goes to the webview line by line, the webview's
//! lines go to its stdin. The webview owns the protocol; this side only spawns and relays.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;

use tauri::ipc::Channel;
use tauri::State;

use crate::git::tool_path;

struct Chat {
    child: Child,
    stdin: ChildStdin,
}

#[derive(Default)]
pub struct ChatState {
    next: AtomicU32,
    chats: Mutex<HashMap<u32, Chat>>,
}

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

#[tauri::command]
pub fn chat_start(
    state: State<'_, ChatState>,
    cwd: String,
    resume: Option<String>,
    model: Option<String>,
    effort: Option<String>,
    on_line: Channel<String>,
) -> Result<u32, String> {
    let mut cmd = Command::new("claude");
    cmd.args(claude_args(
        resume.as_deref(),
        model.as_deref(),
        effort.as_deref(),
    ))
    .current_dir(&cwd)
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
    let mut child = cmd.spawn().map_err(|e| format!("claude: {e}"))?;
    let stdin = child.stdin.take().ok_or("claude: no stdin")?;
    let stdout = child.stdout.take().ok_or("claude: no stdout")?;
    let stderr = child.stderr.take().ok_or("claude: no stderr")?;

    let errors = on_line.clone();
    std::thread::spawn(move || {
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            let _ = errors
                .send(serde_json::json!({ "type": "aimux_stderr", "text": line }).to_string());
        }
    });
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if !line.trim().is_empty() {
                let _ = on_line.send(line);
            }
        }
        let _ = on_line.send(r#"{"type":"aimux_exit"}"#.into());
    });

    let id = state.next.fetch_add(1, Ordering::Relaxed);
    state
        .chats
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .insert(id, Chat { child, stdin });
    Ok(id)
}

#[tauri::command]
pub fn chat_send(state: State<'_, ChatState>, id: u32, line: String) -> Result<(), String> {
    let mut chats = state.chats.lock().unwrap_or_else(|e| e.into_inner());
    let chat = chats.get_mut(&id).ok_or("chat is closed")?;
    writeln!(chat.stdin, "{line}")
        .and_then(|()| chat.stdin.flush())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn chat_stop(state: State<'_, ChatState>, id: u32) {
    if let Some(mut chat) = state
        .chats
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .remove(&id)
    {
        let _ = chat.child.kill();
        let _ = chat.child.wait();
    }
}

/// The models Claude Code offers, as its `initialize` answer lists them (JSON). A headless
/// Claude starts, answers, and is stopped: no turn is run, nothing reaches the API.
#[tauri::command(async)]
pub fn claude_models() -> Result<String, String> {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/".into());
    let mut cmd = Command::new("claude");
    cmd.args(claude_args(None, None, None))
        .current_dir(&home)
        .env("PATH", tool_path())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    for (key, _) in std::env::vars() {
        if key == "CLAUDECODE" || key.starts_with("CLAUDE_CODE_") {
            cmd.env_remove(key);
        }
    }
    let mut child = cmd.spawn().map_err(|e| format!("claude: {e}"))?;
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
                found = Some(message["response"]["response"]["models"].to_string());
                break;
            }
        }
    }
    let _ = child.kill();
    let _ = child.wait();
    found.ok_or_else(|| "Claude Code did not list its models.".into())
}

#[cfg(test)]
mod tests {
    use super::*;

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
