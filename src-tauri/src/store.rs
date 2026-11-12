//! What the app keeps: its projects, their workspaces (one git worktree each) and the chats
//! open in them, in one JSON file; settings and setup scripts next to it.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use tauri::State;

use crate::git::tool_path;

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    pub last_opened_at: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupRun {
    pub exit_code: Option<u32>,
    pub ran_at: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub branch: String,
    /// What it forked from: `origin/<base>` when the base was refreshed first.
    pub base: String,
    pub path: String,
    pub created_at: u64,
    #[serde(default)]
    pub setup: Option<SetupRun>,
    /// What its chats published with Claude Code's `Artifact` tool, as the panel's tabs.
    #[serde(default)]
    pub artifacts: Vec<Artifact>,
    /// The chat whose agent created it (through aimux's MCP), if one did.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_chat: Option<String>,
    /// Put aside by the user: drawn muted until a message is sent in it.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub paused: bool,
}

/// A published artifact: its claude.ai page, open as a tab of the right panel until closed.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Artifact {
    pub url: String,
    pub title: String,
    pub chat_id: String,
    /// When it was last published (ms): newer than `seen_at` reads as new.
    pub at: u64,
    #[serde(default)]
    pub seen_at: Option<u64>,
    /// Closed tabs are kept, so a replayed history doesn't bring them back.
    #[serde(default)]
    pub closed: bool,
}

/// A chat tab, enough to bring it back: Claude Code keeps the transcript under `session_id`.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatRecord {
    pub id: String,
    pub workspace_id: String,
    pub title: String,
    #[serde(default)]
    pub session_id: Option<String>,
    #[serde(default)]
    pub model: String,
    #[serde(default)]
    pub effort: String,
    pub created_at: u64,
    /// When a turn last started or ended (ms): the sidebar's age. 0 in older catalogs.
    #[serde(default)]
    pub active_at: u64,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct Catalog {
    #[serde(default)]
    pub projects: Vec<Project>,
    #[serde(default)]
    pub workspaces: Vec<Workspace>,
    #[serde(default)]
    pub chats: Vec<ChatRecord>,
}

#[derive(Default)]
pub struct Store(Mutex<Option<Catalog>>);

fn env(name: &str) -> Option<String> {
    std::env::var(name).ok().filter(|v| !v.is_empty())
}

fn home() -> PathBuf {
    PathBuf::from(env("HOME").unwrap_or_default())
}

/// A profile name as a folder name: lowercase letters, digits, `.`, `_`, `-`.
pub fn sanitize(raw: &str) -> String {
    let mut out = String::new();
    for c in raw.trim().to_lowercase().chars() {
        let c = if c.is_ascii_alphanumeric() || matches!(c, '.' | '_') {
            c
        } else {
            '-'
        };
        if !(c == '-' && out.ends_with('-')) {
            out.push(c);
        }
    }
    let out = out.trim_matches('-');
    if out.is_empty() {
        "default".into()
    } else {
        out.into()
    }
}

/// `AIMUX_PROFILE` keeps a trial run (`gui-dev`) apart from everyday data. A dev build is
/// `dev` unless told otherwise, so it never touches the installed app's data or host.
fn profile() -> Option<String> {
    env("AIMUX_PROFILE")
        .or_else(|| cfg!(debug_assertions).then(|| "dev".into()))
        .filter(|p| p != "default")
}

/// `~/.local/share/aimux-desktop[-<profile>]`, or `AIMUX_DESKTOP_HOME`.
pub fn data_dir() -> PathBuf {
    if let Some(dir) = env("AIMUX_DESKTOP_HOME") {
        return PathBuf::from(dir);
    }
    let name = match profile() {
        Some(p) => format!("aimux-desktop-{}", sanitize(&p)),
        None => "aimux-desktop".into(),
    };
    home().join(".local/share").join(name)
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn new_id(prefix: &str) -> String {
    format!("{prefix}-{:x}", now() ^ u64::from(std::process::id()) << 40)
}

pub fn write_atomic(path: &Path, contents: &str) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension(format!("tmp.{}", std::process::id()));
    std::fs::write(&tmp, contents).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, path).map_err(|e| e.to_string())
}

fn catalog_file() -> PathBuf {
    data_dir().join("catalog.json")
}

/// The projects aimux knows, for a first launch to start from: names and folders only.
pub fn imported(aimux_projects: &Value) -> Vec<Project> {
    aimux_projects["projects"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|p| {
            let path = p["projectPath"].as_str()?;
            Some(Project {
                id: p["id"].as_str()?.to_string(),
                last_opened_at: 0,
                name: p["name"].as_str().unwrap_or(path).to_string(),
                path: path.to_string(),
            })
        })
        .filter(|p| Path::new(&p.path).is_dir())
        .collect()
}

/// The catalog as saved: what another process (the MCP server) reads.
pub fn saved_catalog() -> Catalog {
    load()
}

fn load() -> Catalog {
    if let Ok(raw) = std::fs::read_to_string(catalog_file()) {
        return serde_json::from_str(&raw).unwrap_or_default();
    }
    let aimux = home()
        .join(".config/aimux")
        .join(sanitize(&profile().unwrap_or_else(|| "default".into())))
        .join("aimux-projects.json");
    let projects = std::fs::read_to_string(aimux)
        .ok()
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
        .map(|v| imported(&v))
        .unwrap_or_default();
    let catalog = Catalog {
        projects,
        ..Catalog::default()
    };
    // Written even when empty: the import happens once.
    let _ = save(&catalog);
    catalog
}

fn save(catalog: &Catalog) -> Result<(), String> {
    let json = serde_json::to_string_pretty(catalog).map_err(|e| e.to_string())?;
    write_atomic(&catalog_file(), &json)
}

/// Reads, edits and writes the catalog under one lock; the edit's result is returned.
pub fn edit<T>(
    store: &Store,
    f: impl FnOnce(&mut Catalog) -> Result<T, String>,
) -> Result<T, String> {
    let mut guard = store.0.lock().unwrap_or_else(|e| e.into_inner());
    let catalog = guard.get_or_insert_with(load);
    let out = f(catalog)?;
    save(catalog)?;
    Ok(out)
}

#[tauri::command]
pub fn catalog(store: State<'_, Store>) -> Catalog {
    let mut guard = store.0.lock().unwrap_or_else(|e| e.into_inner());
    guard.get_or_insert_with(load).clone()
}

#[tauri::command]
pub fn project_add(store: State<'_, Store>, path: String) -> Result<Project, String> {
    let dir = Path::new(&path);
    if !dir.is_dir() {
        return Err(format!("{path} is not a folder"));
    }
    let name = dir
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.clone());
    edit(&store, |c| {
        if let Some(p) = c.projects.iter_mut().find(|p| p.path == path) {
            p.last_opened_at = now();
            return Ok(p.clone());
        }
        let project = Project {
            id: new_id("project"),
            last_opened_at: now(),
            name,
            path: path.clone(),
        };
        c.projects.push(project.clone());
        Ok(project)
    })
}

/// The project leaves the app; its folder and worktrees stay on disk.
#[tauri::command]
pub fn project_remove(store: State<'_, Store>, id: String) -> Result<(), String> {
    edit(&store, |c| {
        let gone: Vec<String> = c
            .workspaces
            .iter()
            .filter(|w| w.project_id == id)
            .map(|w| w.id.clone())
            .collect();
        c.projects.retain(|p| p.id != id);
        c.workspaces.retain(|w| w.project_id != id);
        c.chats.retain(|chat| !gone.contains(&chat.workspace_id));
        Ok(())
    })
}

#[tauri::command]
pub fn project_open(store: State<'_, Store>, id: String) -> Result<(), String> {
    edit(&store, |c| {
        if let Some(p) = c.projects.iter_mut().find(|p| p.id == id) {
            p.last_opened_at = now();
        }
        Ok(())
    })
}

/// Puts the projects and workspaces `ids` names in that order: the sidebar's, as dragged.
/// What it doesn't name keeps its place relative to the rest, after them.
pub fn reorder(c: &mut Catalog, ids: &[String]) {
    let rank = |id: &str| ids.iter().position(|x| x == id).unwrap_or(usize::MAX);
    c.projects.sort_by_key(|p| rank(&p.id));
    c.workspaces.sort_by_key(|w| rank(&w.id));
}

#[tauri::command]
pub fn catalog_reorder(store: State<'_, Store>, ids: Vec<String>) -> Result<(), String> {
    edit(&store, |c| {
        reorder(c, &ids);
        Ok(())
    })
}

fn git(cwd: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .env("PATH", tool_path())
        .output()
        .map_err(|e| format!("git: {e}"))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

/// The first candidate nothing holds yet: no folder, no branch, no workspace by that name.
pub fn free_name(candidates: &[String], taken: impl Fn(&str) -> bool) -> Option<&str> {
    candidates.iter().map(String::as_str).find(|c| !taken(c))
}

/// The TUI's settings that shape a new worktree: refresh the base first, files to seed it with.
fn worktree_settings() -> (bool, Vec<String>) {
    let settings = read_settings_map();
    let fetch = settings.get("git.fetchBase") != Some(&Value::Bool(false));
    let copy = settings
        .get("git.worktreeCopyFiles")
        .and_then(Value::as_str)
        .unwrap_or(".env")
        .split(',')
        .map(|p| p.trim().to_string())
        .filter(|p| !p.is_empty())
        .collect();
    (fetch, copy)
}

/// Untracked files (`.env`…) from the main checkout, never over one the worktree has.
fn seed(repo: &Path, target: &Path, patterns: &[String]) {
    for pattern in patterns {
        let Ok(matches) = glob::glob(&repo.join(pattern).to_string_lossy()) else {
            continue;
        };
        for from in matches.flatten().filter(|p| p.is_file()) {
            let Ok(relative) = from.strip_prefix(repo) else {
                continue;
            };
            let to = target.join(relative);
            if to.exists() {
                continue;
            }
            if let Some(dir) = to.parent() {
                let _ = std::fs::create_dir_all(dir);
            }
            let _ = std::fs::copy(&from, &to);
        }
    }
}

/// A new worktree on `aimux/<name>`, named after the first free candidate, forked from `base`.
#[tauri::command(async)]
pub fn workspace_create(
    store: State<'_, Store>,
    project_id: String,
    candidates: Vec<String>,
    base: Option<String>,
    parent_chat: Option<String>,
) -> Result<Workspace, String> {
    let (project, names) = {
        let mut guard = store.0.lock().unwrap_or_else(|e| e.into_inner());
        let c = guard.get_or_insert_with(load);
        let project = c
            .projects
            .iter()
            .find(|p| p.id == project_id)
            .cloned()
            .ok_or("unknown project")?;
        let names: Vec<String> = c
            .workspaces
            .iter()
            .filter(|w| w.project_id == project_id)
            .map(|w| w.name.clone())
            .collect();
        (project, names)
    };
    let (fetch, copy) = worktree_settings();
    let root = data_dir().join("worktrees").join(&project.id);
    let mut workspace = make_worktree(&project, &root, &names, &candidates, base, fetch, &copy)?;
    workspace.parent_chat = parent_chat;
    edit(&store, |c| {
        c.workspaces.push(workspace.clone());
        Ok(workspace.clone())
    })
}

/// The git side of a new workspace, under `root`: the branch, the worktree, its seed files.
/// A repository without commits has no HEAD to fork a worktree from: it gets an empty first
/// commit on its current branch. Built from an empty tree, so the files and the index (anything
/// already staged) stay as they are.
fn ensure_first_commit(repo: &str) -> Result<(), String> {
    if git(repo, &["rev-parse", "--verify", "--quiet", "HEAD"]).is_ok() {
        return Ok(());
    }
    let tree = git(repo, &["hash-object", "-w", "-t", "tree", "--stdin"])?;
    let commit = git(repo, &["commit-tree", tree.trim(), "-m", "Initial commit"])?;
    git(repo, &["update-ref", "HEAD", commit.trim()])?;
    Ok(())
}

pub fn make_worktree(
    project: &Project,
    root: &Path,
    names: &[String],
    candidates: &[String],
    base: Option<String>,
    fetch: bool,
    copy: &[String],
) -> Result<Workspace, String> {
    let repo = project.path.as_str();
    ensure_first_commit(repo)?;
    let base = match base {
        Some(b) => b,
        None => git(repo, &["rev-parse", "--abbrev-ref", "HEAD"])?
            .trim()
            .to_string(),
    };
    let fork = if fetch {
        let remote = format!("origin/{base}");
        let _ = git(
            repo,
            &["fetch", "origin", &format!("+{base}:refs/remotes/{remote}")],
        );
        if git(repo, &["rev-parse", "--verify", "--quiet", &remote]).is_ok() {
            remote
        } else {
            base
        }
    } else {
        base
    };
    let name = free_name(candidates, |c| {
        names.iter().any(|n| n == c)
            || root.join(c).exists()
            || git(
                repo,
                &[
                    "rev-parse",
                    "--verify",
                    "--quiet",
                    &format!("refs/heads/aimux/{c}"),
                ],
            )
            .is_ok()
    })
    .ok_or("every name is taken")?
    .to_string();
    let target = root.join(&name);
    std::fs::create_dir_all(root).map_err(|e| e.to_string())?;
    let branch = format!("aimux/{name}");
    let path = target.to_string_lossy().into_owned();
    // `--no-track`: a branch forked from origin/main must not push onto main.
    if let Err(error) = git(
        repo,
        &[
            "worktree",
            "add",
            "--quiet",
            "--no-track",
            "-b",
            &branch,
            &path,
            &fork,
        ],
    ) {
        // A failing post-checkout hook still leaves the worktree made, on our branch.
        let made = git(&path, &["rev-parse", "--abbrev-ref", "HEAD"])
            .map(|b| b.trim() == branch)
            .unwrap_or(false);
        if !made {
            return Err(format!("{error} (in {repo})"));
        }
    }
    seed(Path::new(repo), &target, copy);
    Ok(Workspace {
        base: fork,
        branch,
        created_at: now(),
        id: new_id("workspace"),
        name,
        path,
        project_id: project.id.clone(),
        setup: None,
        artifacts: Vec::new(),
        parent_chat: None,
        paused: false,
    })
}

/// Removes a worktree folder; the branch stays. Without `force`, git refuses to drop changes, and
/// that is the only refusal: when git fails otherwise (a process still writing in the folder
/// leaves it "not empty"), the folder is removed by hand and git forgets the worktree.
fn remove_worktree(repo: &str, path: &str, force: bool) -> Result<(), String> {
    if Path::new(path).exists() {
        let mut args = vec!["worktree", "remove"];
        if force {
            args.push("--force");
        }
        args.push(path);
        if let Err(error) = git(repo, &args) {
            if !force && holds_changes(&error) {
                return Err(error);
            }
            remove_dir_hard(Path::new(path)).map_err(|e| format!("{error}\n{e}"))?;
            // A locked worktree would survive the prune.
            let _ = git(repo, &["worktree", "unlock", path]);
        }
    }
    let _ = git(repo, &["worktree", "prune"]);
    Ok(())
}

/// Git's refusal to remove a worktree that holds work.
fn holds_changes(error: &str) -> bool {
    error.contains("modified") || error.contains("untracked") || error.contains("--force")
}

/// `remove_dir_all`, tried again while something keeps writing files into the folder.
fn remove_dir_hard(path: &Path) -> std::io::Result<()> {
    let mut last = Ok(());
    for _ in 0..5 {
        last = std::fs::remove_dir_all(path);
        if last.is_ok() || !path.exists() {
            return Ok(());
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    last
}

/// Removes the worktree folder; the branch stays. Without `force`, git refuses to drop changes.
#[tauri::command(async)]
pub fn workspace_remove(store: State<'_, Store>, id: String, force: bool) -> Result<(), String> {
    let (workspace, repo) = {
        let mut guard = store.0.lock().unwrap_or_else(|e| e.into_inner());
        let c = guard.get_or_insert_with(load);
        let w = c
            .workspaces
            .iter()
            .find(|w| w.id == id)
            .cloned()
            .ok_or("unknown workspace")?;
        let repo = c
            .projects
            .iter()
            .find(|p| p.id == w.project_id)
            .map(|p| p.path.clone())
            .ok_or("unknown project")?;
        (w, repo)
    };
    remove_worktree(&repo, &workspace.path, force)?;
    edit(&store, |c| {
        c.workspaces.retain(|w| w.id != id);
        c.chats.retain(|chat| chat.workspace_id != id);
        Ok(())
    })
}

/// A workspace's display name; its branch and folder stay. An empty name gives the colour
/// (its folder's) back.
pub fn rename_workspace(c: &mut Catalog, id: &str, name: &str) -> Result<Workspace, String> {
    let w = c
        .workspaces
        .iter_mut()
        .find(|w| w.id == id)
        .ok_or("unknown workspace")?;
    let name = name.trim();
    w.name = if name.is_empty() {
        crate::naming::colour_of(w)
    } else {
        name.to_string()
    };
    Ok(w.clone())
}

#[tauri::command]
pub fn workspace_rename(
    store: State<'_, Store>,
    id: String,
    name: String,
) -> Result<Workspace, String> {
    edit(&store, |c| rename_workspace(c, &id, &name))
}

/// A workspace put aside (muted in the sidebar) or taken back up.
pub fn pause_workspace(c: &mut Catalog, id: &str, paused: bool) -> Result<Workspace, String> {
    let w = c
        .workspaces
        .iter_mut()
        .find(|w| w.id == id)
        .ok_or("unknown workspace")?;
    w.paused = paused;
    Ok(w.clone())
}

#[tauri::command]
pub fn workspace_pause(
    store: State<'_, Store>,
    id: String,
    paused: bool,
) -> Result<Workspace, String> {
    edit(&store, |c| pause_workspace(c, &id, paused))
}

#[tauri::command]
pub fn chat_save(store: State<'_, Store>, chat: ChatRecord) -> Result<(), String> {
    edit(&store, |c| {
        match c.chats.iter_mut().find(|r| r.id == chat.id) {
            Some(r) => *r = chat,
            None => c.chats.push(chat),
        }
        Ok(())
    })
}

#[tauri::command]
pub fn chat_forget(store: State<'_, Store>, id: String) -> Result<(), String> {
    edit(&store, |c| {
        c.chats.retain(|r| r.id != id);
        Ok(())
    })
}

fn workspace_artifacts<'a>(
    c: &'a mut Catalog,
    workspace_id: &str,
) -> Result<&'a mut Vec<Artifact>, String> {
    c.workspaces
        .iter_mut()
        .find(|w| w.id == workspace_id)
        .map(|w| &mut w.artifacts)
        .ok_or_else(|| "unknown workspace".to_string())
}

/// Records a publish. A known URL keeps one entry: its title follows (unless empty), and a
/// `live` publish (not a replayed one) also dates it now and reopens a closed tab.
pub fn add_artifact(
    c: &mut Catalog,
    workspace_id: &str,
    url: &str,
    title: &str,
    chat_id: &str,
    live: bool,
    now: u64,
) -> Result<(), String> {
    let list = workspace_artifacts(c, workspace_id)?;
    match list.iter_mut().find(|a| a.url == url) {
        Some(a) => {
            if !title.is_empty() {
                a.title = title.to_string();
            }
            if live {
                a.at = now;
                a.closed = false;
            }
        }
        None => list.push(Artifact {
            url: url.to_string(),
            title: title.to_string(),
            chat_id: chat_id.to_string(),
            at: now,
            seen_at: None,
            closed: false,
        }),
    }
    Ok(())
}

pub fn close_artifact(c: &mut Catalog, workspace_id: &str, url: &str) -> Result<(), String> {
    for a in workspace_artifacts(c, workspace_id)?
        .iter_mut()
        .filter(|a| a.url == url)
    {
        a.closed = true;
    }
    Ok(())
}

pub fn see_artifact(
    c: &mut Catalog,
    workspace_id: &str,
    url: &str,
    now: u64,
) -> Result<(), String> {
    for a in workspace_artifacts(c, workspace_id)?
        .iter_mut()
        .filter(|a| a.url == url)
    {
        a.seen_at = Some(now);
    }
    Ok(())
}

#[tauri::command]
pub fn artifact_add(
    store: State<'_, Store>,
    workspace_id: String,
    url: String,
    title: String,
    chat_id: String,
    live: bool,
) -> Result<(), String> {
    edit(&store, |c| {
        add_artifact(c, &workspace_id, &url, &title, &chat_id, live, now())
    })
}

#[tauri::command]
pub fn artifact_close(
    store: State<'_, Store>,
    workspace_id: String,
    url: String,
) -> Result<(), String> {
    edit(&store, |c| close_artifact(c, &workspace_id, &url))
}

#[tauri::command]
pub fn artifact_seen(
    store: State<'_, Store>,
    workspace_id: String,
    url: String,
) -> Result<(), String> {
    edit(&store, |c| see_artifact(c, &workspace_id, &url, now()))
}

fn settings_file() -> PathBuf {
    data_dir().join("settings.json")
}

fn read_settings_map() -> Map<String, Value> {
    std::fs::read_to_string(settings_file())
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

/// Where Claude Code compacts on its own (Settings › Chats › Compact past), in tokens; None
/// for "1M": the model's whole window. Unset, 250k.
pub fn compact_window() -> Option<u64> {
    compact_window_of(read_settings_map().get("chat.compactWindow"))
}

fn compact_window_of(value: Option<&Value>) -> Option<u64> {
    match value.and_then(Value::as_str).unwrap_or("250k") {
        "1M" => None,
        "200k" => Some(200_000),
        "400k" => Some(400_000),
        _ => Some(250_000),
    }
}

#[tauri::command]
pub fn read_settings() -> Value {
    serde_json::json!({ "path": settings_file(), "settings": read_settings_map() })
}

/// Sets one setting (`null` resets it), keeping the others.
#[tauri::command]
pub fn write_setting(id: String, value: Value) -> Result<(), String> {
    if !matches!(
        value,
        Value::Null | Value::Bool(_) | Value::Number(_) | Value::String(_)
    ) {
        return Err("a setting is a boolean, a number or a string".into());
    }
    let mut settings = read_settings_map();
    if value.is_null() {
        settings.remove(&id);
    } else {
        settings.insert(id, value);
    }
    let json = serde_json::to_string_pretty(&Value::Object(settings)).map_err(|e| e.to_string())?;
    write_atomic(&settings_file(), &json)
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
    Ok(data_dir()
        .join("projects")
        .join(project_id)
        .join("setup.sh"))
}

/// The project's setup script: whether it exists, and where.
#[tauri::command]
pub fn setup_status(project_id: String) -> Result<Value, String> {
    let path = setup_path(&project_id)?;
    Ok(serde_json::json!({ "exists": path.exists(), "path": path }))
}

/// Writes the stub if there is no script yet; returns the script's path.
#[tauri::command]
pub fn ensure_setup_script(project_id: String) -> Result<String, String> {
    let path = setup_path(&project_id)?;
    if !path.exists() {
        write_atomic(&path, SETUP_STUB)?;
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

/// The project's run command (`projects/<id>/run`): what Run starts in a workspace.
fn run_path(project_id: &str) -> Result<PathBuf, String> {
    Ok(setup_path(project_id)?.with_file_name("run"))
}

/// The project's run command, "" when none is set.
#[tauri::command]
pub fn run_command(project_id: String) -> Result<String, String> {
    match std::fs::read_to_string(run_path(&project_id)?) {
        Ok(text) => Ok(text.trim().to_string()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(e.to_string()),
    }
}

/// Saves the project's run command; an empty one removes it.
#[tauri::command]
pub fn set_run_command(project_id: String, command: String) -> Result<(), String> {
    let path = run_path(&project_id)?;
    let command = command.trim();
    if command.is_empty() {
        return match std::fs::remove_file(&path) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
            _ => Ok(()),
        };
    }
    write_atomic(&path, &format!("{command}\n"))
}

#[tauri::command]
pub fn setup_ran(
    store: State<'_, Store>,
    workspace_id: String,
    exit_code: Option<u32>,
) -> Result<(), String> {
    edit(&store, |c| {
        if let Some(w) = c.workspaces.iter_mut().find(|w| w.id == workspace_id) {
            w.setup = Some(SetupRun {
                exit_code,
                ran_at: now(),
            });
        }
        Ok(())
    })
}

#[cfg(test)]
mod tests {
    #[test]
    fn reorder_follows_the_ids_and_keeps_the_rest() {
        let p = |id: &str| Project {
            id: id.into(),
            ..Default::default()
        };
        let mut c = Catalog {
            projects: vec![p("a"), p("b"), p("c")],
            ..Default::default()
        };
        super::reorder(&mut c, &["c".into(), "a".into()]);
        let ids: Vec<&str> = c.projects.iter().map(|p| p.id.as_str()).collect();
        assert_eq!(ids, ["c", "a", "b"]);
    }

    use super::*;

    #[test]
    fn compact_window_defaults_to_250k_and_1m_means_none() {
        assert_eq!(compact_window_of(None), Some(250_000));
        assert_eq!(compact_window_of(Some(&Value::from("200k"))), Some(200_000));
        assert_eq!(compact_window_of(Some(&Value::from("1M"))), None);
        assert_eq!(compact_window_of(Some(&Value::from(7))), Some(250_000));
    }

    fn one_workspace() -> Catalog {
        serde_json::from_value(serde_json::json!({ "workspaces": [{
            "id": "w", "projectId": "p", "name": "amber", "branch": "aimux/amber",
            "base": "main", "path": "/wt/amber", "createdAt": 0
        }]}))
        .unwrap()
    }

    const URL: &str = "https://claude.ai/artifact/abc";

    fn artifacts(c: &Catalog) -> &Vec<Artifact> {
        &c.workspaces[0].artifacts
    }

    #[test]
    fn artifacts_default_to_empty_in_old_catalogs() {
        assert!(artifacts(&one_workspace()).is_empty());
    }

    #[test]
    fn add_is_idempotent_by_url() {
        let mut c = one_workspace();
        add_artifact(&mut c, "w", URL, "Flow", "c1", true, 10).unwrap();
        add_artifact(&mut c, "w", URL, "Flow", "c1", true, 20).unwrap();
        assert_eq!(artifacts(&c).len(), 1);
        assert_eq!(artifacts(&c)[0].at, 20);
    }

    #[test]
    fn live_add_of_a_known_url_updates_at_title_and_reopens() {
        let mut c = one_workspace();
        add_artifact(&mut c, "w", URL, "Flow", "c1", true, 10).unwrap();
        close_artifact(&mut c, "w", URL).unwrap();
        add_artifact(&mut c, "w", URL, "Flow v2", "c1", true, 30).unwrap();
        let a = &artifacts(&c)[0];
        assert_eq!((a.closed, a.at, a.title.as_str()), (false, 30, "Flow v2"));
    }

    #[test]
    fn history_add_never_reopens() {
        let mut c = one_workspace();
        add_artifact(&mut c, "w", URL, "Flow", "c1", true, 10).unwrap();
        close_artifact(&mut c, "w", URL).unwrap();
        add_artifact(&mut c, "w", URL, "Flow", "c1", false, 30).unwrap();
        let a = &artifacts(&c)[0];
        assert_eq!((a.closed, a.at), (true, 10));
    }

    #[test]
    fn empty_title_keeps_the_old_one() {
        let mut c = one_workspace();
        add_artifact(&mut c, "w", URL, "Flow", "c1", true, 10).unwrap();
        add_artifact(&mut c, "w", URL, "", "c1", true, 20).unwrap();
        assert_eq!(artifacts(&c)[0].title, "Flow");
    }

    #[test]
    fn seen_marks_not_new() {
        let mut c = one_workspace();
        add_artifact(&mut c, "w", URL, "Flow", "c1", true, 10).unwrap();
        see_artifact(&mut c, "w", URL, 15).unwrap();
        assert_eq!(artifacts(&c)[0].seen_at, Some(15));
    }

    #[test]
    fn unknown_workspace_is_an_error() {
        let mut c = one_workspace();
        assert!(add_artifact(&mut c, "nope", URL, "", "c1", true, 1).is_err());
        assert!(close_artifact(&mut c, "nope", URL).is_err());
        assert!(see_artifact(&mut c, "nope", URL, 1).is_err());
    }

    #[test]
    fn imports_projects_with_a_folder() {
        let dir = std::env::temp_dir();
        let aimux = serde_json::json!({ "projects": [
            { "id": "p1", "name": "here", "projectPath": dir },
            { "id": "p2", "name": "gone", "projectPath": "/no/such/folder" },
            { "id": "p3", "name": "bare" },
        ]});
        let got = imported(&aimux);
        assert_eq!(got.len(), 1);
        assert_eq!((got[0].id.as_str(), got[0].name.as_str()), ("p1", "here"));
    }

    #[test]
    fn free_name_skips_what_is_taken() {
        let names = ["amber", "azure", "basil"].map(String::from);
        assert_eq!(free_name(&names, |c| c == "amber"), Some("azure"));
        assert_eq!(free_name(&names, |_| true), None);
    }

    #[test]
    fn seed_copies_matches_and_keeps_existing_files() {
        let root = std::env::temp_dir().join(format!("aimux-seed-{}", std::process::id()));
        let (repo, target) = (root.join("repo"), root.join("wt"));
        std::fs::create_dir_all(repo.join("api")).unwrap();
        std::fs::create_dir_all(&target).unwrap();
        std::fs::write(repo.join(".env"), "A=1").unwrap();
        std::fs::write(repo.join("api/.env"), "B=1").unwrap();
        std::fs::write(target.join(".env"), "mine").unwrap();
        seed(&repo, &target, &[".env".into(), "*/.env".into()]);
        assert_eq!(
            std::fs::read_to_string(target.join(".env")).unwrap(),
            "mine"
        );
        assert_eq!(
            std::fs::read_to_string(target.join("api/.env")).unwrap(),
            "B=1"
        );
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn profile_names_fold_to_a_folder_name() {
        assert_eq!(sanitize("My Profile!"), "my-profile");
        assert_eq!(sanitize("  "), "default");
        assert_eq!(sanitize("-a--b_c.d-"), "a-b_c.d");
    }

    fn sh(cwd: &Path, args: &[&str]) {
        let ok = Command::new("git")
            .args(args)
            .current_dir(cwd)
            .output()
            .unwrap()
            .status
            .success();
        assert!(ok, "git {args:?}");
    }

    #[test]
    fn removing_refuses_only_over_changes_and_otherwise_always_succeeds() {
        let root = std::env::temp_dir().join(format!("aimux-rm-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let repo = root.join("repo");
        std::fs::create_dir_all(&repo).unwrap();
        sh(&repo, &["init", "-q", "-b", "main"]);
        let id = ["-c", "user.name=t", "-c", "user.email=t@t"];
        sh(
            &repo,
            &[&id[..], &["commit", "-q", "--allow-empty", "-m", "one"]].concat(),
        );
        let r = repo.to_string_lossy().into_owned();
        let add = |name: &str| {
            let path = root.join(name);
            let p = path.to_string_lossy().into_owned();
            sh(&repo, &["worktree", "add", "-q", "-b", name, &p]);
            (path, p)
        };

        // Changes: refused without force, gone with it.
        let (dirty, d) = add("dirty");
        std::fs::write(dirty.join("new.txt"), "x").unwrap();
        assert!(remove_worktree(&r, &d, false).is_err());
        remove_worktree(&r, &d, true).unwrap();
        assert!(!dirty.exists());

        // Git refusing for another reason (here, a lock) does not stop the delete.
        let (locked, l) = add("locked");
        sh(&repo, &["worktree", "lock", &l]);
        remove_worktree(&r, &l, false).unwrap();
        assert!(!locked.exists());
        let list = git(&r, &["worktree", "list"]).unwrap();
        assert!(!list.contains("locked"), "{list}");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn a_repository_without_commits_gets_an_empty_first_one_and_keeps_its_index() {
        let root = std::env::temp_dir().join(format!("aimux-empty-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let repo = root.join("repo");
        std::fs::create_dir_all(&repo).unwrap();
        sh(&repo, &["init", "-q", "-b", "main"]);
        sh(&repo, &["config", "user.name", "t"]);
        sh(&repo, &["config", "user.email", "t@t"]);
        std::fs::write(repo.join("a.txt"), "x").unwrap();
        sh(&repo, &["add", "a.txt"]);
        let r = repo.to_string_lossy().into_owned();
        ensure_first_commit(&r).unwrap();
        let head = git(&r, &["rev-parse", "--abbrev-ref", "HEAD"]).unwrap();
        assert_eq!(head.trim(), "main");
        let files = git(&r, &["ls-tree", "-r", "--name-only", "HEAD"]).unwrap();
        assert_eq!(files.trim(), "");
        let staged = git(&r, &["diff", "--cached", "--name-only"]).unwrap();
        assert_eq!(staged.trim(), "a.txt");
        ensure_first_commit(&r).unwrap();
        let count = git(&r, &["rev-list", "--count", "HEAD"]).unwrap();
        assert_eq!(count.trim(), "1");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn a_worktree_forks_from_the_base_on_a_free_colour_and_gets_its_env() {
        let root = std::env::temp_dir().join(format!("aimux-wt-{}", std::process::id()));
        let repo = root.join("repo");
        std::fs::create_dir_all(&repo).unwrap();
        sh(&repo, &["init", "-q", "-b", "main"]);
        sh(
            &repo,
            &[
                "-c",
                "user.name=t",
                "-c",
                "user.email=t@t",
                "commit",
                "-q",
                "--allow-empty",
                "-m",
                "one",
            ],
        );
        sh(&repo, &["branch", "aimux/amber"]);
        std::fs::write(repo.join(".env"), "KEY=1").unwrap();
        let project = Project {
            id: "p".into(),
            last_opened_at: 0,
            name: "repo".into(),
            path: repo.to_string_lossy().into_owned(),
        };
        let names = ["amber", "azure", "basil"].map(String::from);
        let taken = ["azure".to_string()];
        let wt = root.join("worktrees");
        let made = make_worktree(
            &project,
            &wt,
            &taken,
            &names,
            Some("main".into()),
            true,
            &[".env".into()],
        )
        .unwrap();
        // amber's branch exists, azure is a workspace already: basil it is. No origin: main.
        assert_eq!(
            (made.name.as_str(), made.branch.as_str(), made.base.as_str()),
            ("basil", "aimux/basil", "main")
        );
        assert_eq!(
            std::fs::read_to_string(wt.join("basil/.env")).unwrap(),
            "KEY=1"
        );
        let head = git(&made.path, &["rev-parse", "--abbrev-ref", "HEAD"]).unwrap();
        assert_eq!(head.trim(), "aimux/basil");
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn rename_changes_the_name_only_and_empty_gives_the_colour_back() {
        let mut c = Catalog {
            workspaces: vec![Workspace {
                base: "main".into(),
                branch: "aimux/amber".into(),
                created_at: 0,
                id: "w".into(),
                name: "amber".into(),
                path: "/wt/amber".into(),
                project_id: "p".into(),
                setup: None,
                artifacts: Vec::new(),
                parent_chat: None,
                paused: false,
            }],
            ..Catalog::default()
        };
        let w = rename_workspace(&mut c, "w", "  Billing webhooks ").unwrap();
        assert_eq!(
            (w.name.as_str(), w.branch.as_str(), w.path.as_str()),
            ("Billing webhooks", "aimux/amber", "/wt/amber")
        );
        assert_eq!(rename_workspace(&mut c, "w", " ").unwrap().name, "amber");
        assert!(rename_workspace(&mut c, "nope", "x").is_err());
        assert!(pause_workspace(&mut c, "w", true).unwrap().paused);
        assert!(!pause_workspace(&mut c, "w", false).unwrap().paused);
        assert!(pause_workspace(&mut c, "nope", true).is_err());
    }

    #[test]
    fn a_chat_keeps_its_activity_and_older_catalogs_read_as_zero() {
        let chat: ChatRecord = serde_json::from_value(serde_json::json!({
            "id": "c", "workspaceId": "w", "title": "t", "createdAt": 1, "activeAt": 42,
        }))
        .unwrap();
        let back = serde_json::to_value(&chat).unwrap();
        assert_eq!(back["activeAt"], 42);
        let old: ChatRecord = serde_json::from_value(serde_json::json!({
            "id": "c", "workspaceId": "w", "title": "t", "createdAt": 1,
        }))
        .unwrap();
        assert_eq!(old.active_at, 0);
    }

    #[test]
    fn setup_path_refuses_traversal() {
        assert!(setup_path("../x").is_err());
        assert!(setup_path("a/b").is_err());
        assert!(setup_path("project-1").is_ok());
    }
}
