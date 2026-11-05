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
pub fn claude_args(resume: Option<&str>) -> Vec<String> {
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
    on_line: Channel<String>,
) -> Result<u32, String> {
    let mut cmd = Command::new("claude");
    cmd.args(claude_args(resume.as_deref()))
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
            let _ = errors.send(serde_json::json!({ "type": "aimux_stderr", "text": line }).to_string());
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
    if let Some(mut chat) = state.chats.lock().unwrap_or_else(|e| e.into_inner()).remove(&id) {
        let _ = chat.child.kill();
        let _ = chat.child.wait();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resume_only_with_an_id() {
        assert!(!claude_args(None).contains(&"--resume".to_string()));
        assert!(!claude_args(Some("")).contains(&"--resume".to_string()));
        let args = claude_args(Some("abc"));
        assert_eq!(&args[args.len() - 2..], ["--resume", "abc"]);
    }
}
