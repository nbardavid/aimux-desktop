//! Claude's subscription quota, as `/api/oauth/usage` reports it, and its cache.

use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};

use serde_json::Value;

use crate::store::{data_dir, write_atomic};

fn home() -> PathBuf {
    PathBuf::from(std::env::var("HOME").unwrap_or_default())
}

fn quota_cache() -> PathBuf {
    data_dir().join("quota.json")
}

/// `{ claude?: { fetchedAt, snapshot } }`: what the last poll saw, so a launch has numbers.
#[tauri::command]
pub fn read_quota_cache() -> Value {
    std::fs::read_to_string(quota_cache())
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or(Value::Null)
}

#[tauri::command]
pub fn write_quota_cache(cache: Value) -> Result<(), String> {
    write_atomic(&quota_cache(), &cache.to_string())
}

fn claude_token() -> Result<String, String> {
    let keychain = Command::new("security")
        .args([
            "find-generic-password",
            "-s",
            "Claude Code-credentials",
            "-w",
        ])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).into_owned());
    let claude_home = std::env::var("CLAUDE_CONFIG_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| home().join(".claude"));
    let raw = keychain
        .or_else(|| std::fs::read_to_string(claude_home.join(".credentials.json")).ok())
        .ok_or("no Claude credentials — run `claude` to sign in")?;
    let parsed: Value =
        serde_json::from_str(raw.trim()).map_err(|_| "Claude credentials do not parse")?;
    parsed["claudeAiOauth"]["accessToken"]
        .as_str()
        .map(str::to_string)
        .ok_or_else(|| "no Claude OAuth token".into())
}

/// `GET /api/oauth/usage`, raw body. The token stays on this side: curl reads it from stdin.
#[tauri::command(async)]
pub fn fetch_claude_usage() -> Result<Value, String> {
    let token = claude_token()?;
    let mut curl = Command::new("curl")
        .args([
            "-sS",
            "-m",
            "15",
            "-K",
            "-",
            "-w",
            "\n%{http_code}",
            "https://api.anthropic.com/api/oauth/usage",
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("curl: {e}"))?;
    if let Some(mut stdin) = curl.stdin.take() {
        // ponytail: fixed client version; read it from `claude --version` if the endpoint starts checking it.
        let config = format!(
            "header = \"Authorization: Bearer {token}\"\nheader = \"anthropic-beta: oauth-2025-04-20\"\nheader = \"User-Agent: claude-code/2.1.0\"\n"
        );
        stdin
            .write_all(config.as_bytes())
            .map_err(|e| e.to_string())?;
    }
    let out = curl.wait_with_output().map_err(|e| e.to_string())?;
    let text = String::from_utf8_lossy(&out.stdout);
    let (body, status) = text.rsplit_once('\n').unwrap_or((&text, ""));
    match status {
        "200" => serde_json::from_str(body).map_err(|e| e.to_string()),
        "401" | "403" => Err("claude oauth expired — run `claude` to re-auth".into()),
        "" => Err(String::from_utf8_lossy(&out.stderr).trim().to_string()),
        code => Err(format!("claude api {code}")),
    }
}
