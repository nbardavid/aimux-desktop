use std::process::Command;
use std::sync::Mutex;

use tauri::ipc::Channel;
use tauri::State;

use crate::link::{spawn_link, LinkWriter};
use crate::paths::{aimux_bin, daemon_socket_path};

#[derive(Default)]
pub struct DaemonState(pub Mutex<Option<LinkWriter>>);

fn env(name: &str) -> Option<String> {
    std::env::var(name).ok()
}

fn home() -> String {
    env("HOME").unwrap_or_default()
}

#[tauri::command]
pub fn daemon_connect(
    state: State<'_, DaemonState>,
    on_message: Channel<String>,
    on_close: Channel<String>,
) -> Result<(), String> {
    // Same precedence as `getProfileName`: AIMUX_PROFILE ?? AIMUX_RUNTIME_PROFILE.
    let profile = env("AIMUX_PROFILE").or_else(|| env("AIMUX_RUNTIME_PROFILE"));
    let path = daemon_socket_path(
        env("XDG_RUNTIME_DIR").as_deref(),
        &home(),
        profile.as_deref(),
    );
    let writer = spawn_link(
        &path,
        move |json| {
            let _ = on_message.send(json);
        },
        move |reason| {
            let _ = on_close.send(reason);
        },
    )
    .map_err(|e| format!("cannot connect to {}: {e}", path.display()))?;
    *state.0.lock().unwrap_or_else(|e| e.into_inner()) = Some(writer);
    Ok(())
}

#[tauri::command]
pub fn daemon_send(state: State<'_, DaemonState>, json: String) -> Result<(), String> {
    let guard = state.0.lock().unwrap_or_else(|e| e.into_inner());
    let writer = guard.as_ref().ok_or("not connected")?;
    writer.send(&json).map_err(|e| e.to_string())
}

fn run_aimux(args: &[&str]) -> Result<String, String> {
    let home = home();
    let bin = aimux_bin(env("AIMUX_BIN").as_deref(), &home);
    let not_found = || format!("aimux not found at {}. Set AIMUX_BIN.", bin.display());
    if !bin.exists() {
        return Err(not_found());
    }
    // A Finder launch gets a bare PATH; `aimux` is a `#!/usr/bin/env bun` script.
    let path = format!("{home}/.bun/bin:{}", env("PATH").unwrap_or_default());
    let output = Command::new(&bin)
        .args(args)
        .env("PATH", path)
        .output()
        .map_err(|e| match e.kind() {
            std::io::ErrorKind::NotFound => not_found(),
            _ => e.to_string(),
        })?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

#[tauri::command(async)]
pub fn list_projects() -> Result<String, String> {
    run_aimux(&["project", "list", "--json"])
}

/// `tab list` autostarts the daemon.
#[tauri::command(async)]
pub fn ensure_daemon(project_id: String) -> Result<(), String> {
    run_aimux(&["tab", "list", "--project", &project_id]).map(|_| ())
}
