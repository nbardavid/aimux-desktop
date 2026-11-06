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
/// Claude Code's `Artifact` tool, on unless Settings › Chats › Artifacts is off. Claude Code
/// would also open each new artifact in the default browser: the app's panel shows it instead.
pub fn artifact_env(
    settings: &serde_json::Map<String, serde_json::Value>,
) -> Vec<(&'static str, &'static str)> {
    if settings.get("chat.artifacts") == Some(&serde_json::Value::Bool(false)) {
        return Vec::new();
    }
    vec![
        ("CLAUDE_CODE_ARTIFACT", "1"),
        ("CLAUDE_CODE_ARTIFACT_AUTO_OPEN", "0"),
    ]
}

pub fn spawn_claude(cwd: &str, args: Vec<String>) -> Result<Child, String> {
    let mut cmd = Command::new("claude");
    cmd.args(args)
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
    cmd.envs(artifact_env(&crate::store::read_settings_map()));
    cmd.spawn().map_err(|e| format!("claude: {e}"))
}

/// Claude Code's `initialize` answer (JSON): the models it offers and its `/` commands. A
/// headless Claude starts, answers, and is stopped: no turn is run, nothing reaches the API.
#[tauri::command(async)]
pub fn claude_models() -> Result<String, String> {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/".into());
    // Its stderr pipe is never read: the little it prints before the answer fits the buffer.
    let mut child = spawn_claude(&home, claude_args(None, None, None))?;
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
    let file = std::fs::read_dir(&root)
        .map_err(|e| e.to_string())?
        .flatten()
        .map(|dir| dir.path().join(format!("{session_id}.jsonl")))
        .find(|f| f.exists())
        .ok_or("no transcript for this chat")?;
    let raw = std::fs::read_to_string(file).map_err(|e| e.to_string())?;
    Ok(raw
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(String::from)
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn settings(json: &str) -> serde_json::Map<String, serde_json::Value> {
        serde_json::from_str(json).unwrap()
    }

    #[test]
    fn artifact_env_on_by_default() {
        assert_eq!(
            artifact_env(&settings("{}")),
            [
                ("CLAUDE_CODE_ARTIFACT", "1"),
                ("CLAUDE_CODE_ARTIFACT_AUTO_OPEN", "0")
            ]
        );
    }

    #[test]
    fn artifact_env_off_when_disabled() {
        assert!(artifact_env(&settings(r#"{"chat.artifacts": false}"#)).is_empty());
    }

    #[test]
    fn artifact_env_ignores_non_bool() {
        assert_eq!(
            artifact_env(&settings(r#"{"chat.artifacts": "no"}"#)).len(),
            2
        );
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
