use std::process::Command;
use std::sync::Mutex;

use tauri::ipc::Channel;
use tauri::State;

use crate::git::tool_path;
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
    let output = Command::new(&bin)
        .args(args)
        .env("PATH", tool_path())
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

#[tauri::command(async)]
pub fn list_workspaces(project_id: String) -> Result<String, String> {
    run_aimux(&["workspace", "list", "--project", &project_id])
}

/// Through the CLI, so the assistant's command comes from the user's config, as in the TUI.
#[tauri::command(async)]
pub fn create_tab(
    project_id: String,
    assistant: String,
    workspace_id: Option<String>,
    model: Option<String>,
    effort: Option<String>,
) -> Result<String, String> {
    let mut args = vec![
        "tab",
        "create",
        "--project",
        &project_id,
        "--assistant",
        &assistant,
    ];
    if let Some(id) = workspace_id.as_deref() {
        args.extend(["--workspace", id]);
    }
    if let Some(model) = model.as_deref().filter(|m| !m.is_empty()) {
        args.extend(["--model", model]);
    }
    if let Some(effort) = effort.as_deref().filter(|e| !e.is_empty()) {
        args.extend(["--effort", effort]);
    }
    run_aimux(&args)
}

/// Closes the workspace's tabs (the CLI refuses while any lives), then removes the worktree.
/// `force` discards uncommitted changes; the branch is kept either way.
#[tauri::command(async)]
pub fn remove_workspace(
    project_id: String,
    workspace_id: String,
    force: bool,
) -> Result<(), String> {
    let listed = run_aimux(&["tab", "list", "--project", &project_id])?;
    let parsed: serde_json::Value = serde_json::from_str(&listed).map_err(|e| e.to_string())?;
    for tab in parsed["tabs"].as_array().into_iter().flatten() {
        if tab["workspaceId"].as_str() == Some(workspace_id.as_str()) {
            if let Some(id) = tab["id"].as_str() {
                run_aimux(&["tab", "close", "--project", &project_id, id])?;
            }
        }
    }
    let mut args = vec![
        "workspace",
        "remove",
        "--project",
        &project_id,
        &workspace_id,
    ];
    if force {
        args.push("--force");
    }
    match run_aimux(&args) {
        // Closing the last tab can drop the record first: the worktree is gone all the same.
        Err(e) if e.contains("catalog reconciliation failed") && e.contains("not found") => Ok(()),
        other => other.map(|_| ()),
    }
}

#[tauri::command(async)]
pub fn close_project(project_id: String) -> Result<(), String> {
    run_aimux(&["project", "close", &project_id]).map(|_| ())
}

#[tauri::command(async)]
pub fn create_project(name: String, path: String) -> Result<String, String> {
    run_aimux(&["project", "create", &name, "--project", &path])
}

#[tauri::command(async)]
pub fn create_workspace(
    project_id: String,
    name: String,
    base: Option<String>,
) -> Result<String, String> {
    let mut args = vec![
        "workspace",
        "create",
        "--project",
        &project_id,
        "--name",
        &name,
    ];
    if let Some(base) = base.as_deref() {
        args.extend(["--base", base]);
    }
    run_aimux(&args)
}

fn tab_id(created: &str) -> Result<String, String> {
    let parsed: serde_json::Value = serde_json::from_str(created).map_err(|e| e.to_string())?;
    parsed["tabId"]
        .as_str()
        .map(str::to_string)
        .ok_or_else(|| "no tabId in `tab create` output".into())
}

/// A visible terminal tab that runs the project's setup script in the workspace.
#[tauri::command(async)]
pub fn run_setup(project_id: String, workspace_id: String) -> Result<String, String> {
    let script = crate::files::ensure_setup_script(project_id.clone())?;
    let command = format!("bash '{}'", script.replace('\'', "'\\''"));
    let created = run_aimux(&[
        "tab",
        "create",
        "--project",
        &project_id,
        "--workspace",
        &workspace_id,
        "--assistant",
        "terminal",
        "--title",
        "Setup",
        "--command",
        &command,
    ])?;
    tab_id(&created)
}

/// An assistant tab asked to write the setup script; the prompt is submitted in the background.
#[tauri::command(async)]
pub fn setup_agent(
    project_id: String,
    workspace_id: String,
    assistant: String,
) -> Result<String, String> {
    let script = crate::files::ensure_setup_script(project_id.clone())?;
    let created = run_aimux(&[
        "tab",
        "create",
        "--project",
        &project_id,
        "--workspace",
        &workspace_id,
        "--assistant",
        &assistant,
        "--title",
        "Setup script",
    ])?;
    let tab = tab_id(&created)?;
    let prompt = format!(
        "Write the setup script at {script}. It runs in every new git worktree of this project, \
         from the worktree root, to install what a fresh checkout lacks: dependencies, .env files \
         copied from the main checkout, caches. Replace the stub; keep `#!/usr/bin/env bash` and \
         `set -euo pipefail`. Make it idempotent and non-interactive, use no secrets, exit \
         non-zero on failure. Do not run it."
    );
    run_detached(&project_id, &tab, &prompt)?;
    Ok(tab)
}

/// `tab run` waits for the assistant to be ready, then for its turn: leave it running.
fn run_detached(project_id: &str, tab: &str, prompt: &str) -> Result<(), String> {
    let bin = aimux_bin(env("AIMUX_BIN").as_deref(), &home());
    Command::new(bin)
        .args(["tab", "run", "--project", project_id, tab, prompt])
        .env("PATH", tool_path())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}
