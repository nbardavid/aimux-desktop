//! aimux's own files on disk: stats, settings, the quota cache, setup scripts. Fixed names only:
//! the webview never hands in a path to read or write, except a setup script it was given.

use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, SystemTime};

use serde_json::{Map, Value};

use crate::git::tool_path;
use crate::paths::sanitize_profile;

fn home() -> PathBuf {
    PathBuf::from(std::env::var("HOME").unwrap_or_default())
}

/// `~/.config/aimux`: stats live here for every profile.
fn aimux_root() -> PathBuf {
    home().join(".config/aimux")
}

/// `~/.config/aimux/<profile>`, as `getProfileConfigDir` builds it.
fn profile_dir() -> PathBuf {
    let profile = std::env::var("AIMUX_PROFILE")
        .or_else(|_| std::env::var("AIMUX_RUNTIME_PROFILE"))
        .unwrap_or_default();
    aimux_root().join(sanitize_profile(&profile))
}

fn read_or_null(path: &Path) -> Value {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or(Value::Null)
}

/// Same move as the TUI's writers: a sibling temp file, then a rename.
fn write_atomic(path: &Path, contents: &str) -> Result<(), String> {
    let tmp = path.with_extension(format!("json.{}.tmp", std::process::id()));
    std::fs::write(&tmp, contents).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, path).map_err(|e| e.to_string())
}

const ROLLUP_EVERY: Duration = Duration::from_secs(20 * 3600);

/// Usage history and counters; starts `aimux usage-rollup` when the history is a day old.
#[tauri::command(async)]
pub fn read_stats() -> Value {
    let history = aimux_root().join("usage-history.json");
    let stale = std::fs::metadata(&history)
        .and_then(|m| m.modified())
        .map(|t| SystemTime::now().duration_since(t).unwrap_or_default() > ROLLUP_EVERY)
        .unwrap_or(true);
    if stale {
        let bin = crate::paths::aimux_bin(
            std::env::var("AIMUX_BIN").ok().as_deref(),
            &home().to_string_lossy(),
        );
        let _ = Command::new(bin)
            .arg("usage-rollup")
            .env("PATH", tool_path())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn();
    }
    serde_json::json!({
        "counters": read_or_null(&aimux_root().join("usage-counters.json")),
        "history": read_or_null(&history),
        "rolling": stale,
    })
}

fn config_file() -> PathBuf {
    profile_dir().join("aimux.json")
}

/// The `settings` object of the profile's `aimux.json`, and where that file is.
#[tauri::command]
pub fn read_settings() -> Value {
    let settings = match read_or_null(&config_file()) {
        Value::Object(mut config) => config
            .remove("settings")
            .unwrap_or(Value::Object(Map::new())),
        _ => Value::Object(Map::new()),
    };
    serde_json::json!({ "path": config_file(), "settings": settings })
}

/// Sets one setting (`null` resets it), keeping every other key of `aimux.json` as it is.
#[tauri::command]
pub fn write_setting(id: String, value: Value) -> Result<(), String> {
    if !matches!(
        value,
        Value::Null | Value::Bool(_) | Value::Number(_) | Value::String(_)
    ) {
        return Err("a setting is a boolean, a number or a string".into());
    }
    let path = config_file();
    let mut config = match read_or_null(&path) {
        Value::Object(config) => config,
        Value::Null if !path.exists() => Map::new(),
        _ => {
            return Err(format!(
                "{} does not parse; not writing over it",
                path.display()
            ))
        }
    };
    let settings = config
        .entry("settings")
        .or_insert_with(|| Value::Object(Map::new()));
    let Value::Object(settings) = settings else {
        return Err("aimux.json has a settings value that is not an object".into());
    };
    if value.is_null() {
        settings.remove(&id);
    } else {
        settings.insert(id, value);
    }
    std::fs::create_dir_all(profile_dir()).map_err(|e| e.to_string())?;
    write_atomic(
        &path,
        &serde_json::to_string_pretty(&Value::Object(config)).map_err(|e| e.to_string())?,
    )
}

fn quota_cache() -> PathBuf {
    home().join(".cache/aimux/ai-usage.json")
}

/// The TUI's quota cache: `{ claude?: { fetchedAt, snapshot }, codex?: … }`.
#[tauri::command]
pub fn read_quota_cache() -> Value {
    read_or_null(&quota_cache())
}

#[tauri::command]
pub fn write_quota_cache(cache: Value) -> Result<(), String> {
    std::fs::create_dir_all(home().join(".cache/aimux")).map_err(|e| e.to_string())?;
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

const SETUP_STUB: &str = "#!/usr/bin/env bash\n\
# Runs in each new workspace of this project (a fresh git worktree), from its root.\n\
# Install what a fresh checkout lacks: dependencies, .env, caches.\n\
set -euo pipefail\n\n\
echo \"nothing to do yet — edit this script\"\n";

fn setup_path(project_id: &str) -> Result<PathBuf, String> {
    if project_id.is_empty() || project_id.contains(['/', '\\']) || project_id.starts_with('.') {
        return Err("bad project id".into());
    }
    Ok(profile_dir()
        .join("projects")
        .join(project_id)
        .join("setup.sh"))
}

/// The project's setup script and the last run of each workspace, from the catalog.
#[tauri::command]
pub fn setup_status(project_id: String) -> Result<Value, String> {
    let path = setup_path(&project_id)?;
    let catalog = read_or_null(&profile_dir().join("aimux-projects.json"));
    let runs: Map<String, Value> = catalog["projects"]
        .as_array()
        .and_then(|projects| projects.iter().find(|p| p["id"] == project_id.as_str()))
        .and_then(|p| p["workspaces"].as_array())
        .map(|list| {
            list.iter()
                .filter_map(|w| {
                    let id = w["id"].as_str()?;
                    Some((id.to_string(), serde_json::json!({ "exitCode": w["setupExitCode"], "ranAt": w["setupRanAt"] })))
                })
                .collect()
        })
        .unwrap_or_default();
    Ok(serde_json::json!({ "exists": path.exists(), "path": path, "runs": runs }))
}

/// Writes the stub if there is no script yet; returns the script's path.
#[tauri::command]
pub fn ensure_setup_script(project_id: String) -> Result<String, String> {
    let path = setup_path(&project_id)?;
    if !path.exists() {
        std::fs::create_dir_all(path.parent().unwrap_or(&path)).map_err(|e| e.to_string())?;
        std::fs::write(&path, SETUP_STUB).map_err(|e| e.to_string())?;
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755))
            .map_err(|e| e.to_string())?;
    }
    Ok(path.to_string_lossy().into_owned())
}

/// Opens the setup script in the user's text editor (`open -t`), never in a shell.
#[tauri::command]
pub fn edit_setup_script(project_id: String) -> Result<(), String> {
    let path = ensure_setup_script(project_id)?;
    Command::new("open")
        .args(["-t", &path])
        .status()
        .map_err(|e| e.to_string())
        .map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn write_setting_keeps_every_other_key() {
        let home = std::env::temp_dir().join(format!("aimux-files-{}", std::process::id()));
        let dir = home.join(".config/aimux/files-test");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("aimux.json"), r#"{"themeId":"x","settings":{"a":1,"b":true}}"#).unwrap();
        // ponytail: env vars are process-wide; this is the only test that sets them.
        std::env::set_var("HOME", &home);
        std::env::set_var("AIMUX_PROFILE", "files-test");
        write_setting("b".into(), Value::Bool(false)).unwrap();
        write_setting("a".into(), Value::Null).unwrap();
        let written: Value = serde_json::from_str(&std::fs::read_to_string(dir.join("aimux.json")).unwrap()).unwrap();
        assert_eq!(written, serde_json::json!({ "themeId": "x", "settings": { "b": false } }));
        assert!(write_setting("c".into(), serde_json::json!([1])).is_err());
        std::fs::remove_dir_all(&home).unwrap();
    }

    #[test]
    fn setup_path_refuses_traversal() {
        assert!(setup_path("../x").is_err());
        assert!(setup_path("a/b").is_err());
        assert!(setup_path("project-1")
            .unwrap()
            .ends_with("projects/project-1/setup.sh"));
    }
}
