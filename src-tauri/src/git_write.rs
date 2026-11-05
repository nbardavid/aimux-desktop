//! What the TUI's git mode can do, for the git panel (committing is left to the agents): stage,
//! unstage, discard, push, and merge the branch's pull request.
//! Writes run one at a time, as the TUI's queue does, so two never race for the index lock.

use std::path::{Component, Path};
use std::process::Command;
use std::sync::Mutex;

use serde::Serialize;

use crate::git::tool_path;

static WRITES: Mutex<()> = Mutex::new(());

/// stdout on success, git's first lines of stderr otherwise.
fn git(cwd: &str, args: &[&str]) -> Result<String, String> {
    tool(cwd, "git", args)
}

fn tool(cwd: &str, program: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new(program)
        .args(args)
        .current_dir(cwd)
        .env("PATH", tool_path())
        .output()
        .map_err(|e| format!("{program}: {e}"))?;
    if output.status.success() {
        return Ok(String::from_utf8_lossy(&output.stdout).into_owned());
    }
    let stderr = String::from_utf8_lossy(&output.stderr);
    let message = stderr.trim().lines().take(3).collect::<Vec<_>>().join("\n");
    Err(if message.is_empty() {
        format!("{program} {} failed", args.first().unwrap_or(&""))
    } else {
        message
    })
}

fn locked<T>(f: impl FnOnce() -> Result<T, String>) -> Result<T, String> {
    let _guard = WRITES.lock().unwrap_or_else(|e| e.into_inner());
    f()
}

/// A path the webview names must stay inside the workspace.
fn inside(file: &str) -> Result<&str, String> {
    let path = Path::new(file);
    let escapes =
        path.is_absolute() || path.components().any(|c| matches!(c, Component::ParentDir));
    if escapes || file.is_empty() {
        return Err(format!("{file} is outside the workspace"));
    }
    Ok(file)
}

fn with_files<'a>(base: &[&'a str], files: &'a [String]) -> Result<Vec<&'a str>, String> {
    let mut args = base.to_vec();
    args.push("--");
    for file in files {
        args.push(inside(file)?);
    }
    Ok(args)
}

/// `git add`: the given files, or everything with `all`.
#[tauri::command(async)]
pub fn git_stage(path: String, files: Vec<String>, all: bool) -> Result<(), String> {
    locked(|| {
        if all {
            git(&path, &["add", "-A"])
        } else {
            git(&path, &with_files(&["add"], &files)?)
        }
        .map(|_| ())
    })
}

/// Back out of the index: the given files, or everything with `all`.
#[tauri::command(async)]
pub fn git_unstage(path: String, files: Vec<String>, all: bool) -> Result<(), String> {
    locked(|| {
        if all {
            git(&path, &["reset"])
        } else {
            git(&path, &with_files(&["restore", "--staged"], &files)?)
        }
        .map(|_| ())
    })
}

/// Throws a file's changes away: restored from the index, or deleted when git does not track it.
#[tauri::command(async)]
pub fn git_discard(path: String, file: String, untracked: bool) -> Result<(), String> {
    locked(|| {
        let file = inside(&file)?;
        if !untracked {
            return git(&path, &["restore", "--", file]).map(|_| ());
        }
        let target = Path::new(&path).join(file);
        let removed = if target.is_dir() {
            std::fs::remove_dir_all(&target)
        } else {
            std::fs::remove_file(&target)
        };
        removed.map_err(|e| format!("{file}: {e}"))
    })
}

/// `git push`, setting `origin` as upstream the first time.
#[tauri::command(async)]
pub fn git_push(path: String) -> Result<(), String> {
    locked(|| {
        let upstream = git(
            &path,
            &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
        );
        if upstream.is_ok() {
            git(&path, &["push"])
        } else {
            git(&path, &["push", "--set-upstream", "origin", "HEAD"])
        }
        .map(|_| ())
    })
}

#[derive(Debug, Default, PartialEq, Serialize)]
pub struct BranchState {
    pub branch: Option<String>,
    pub upstream: bool,
    /// A repository with no remote has nowhere to push to.
    pub remote: bool,
    pub ahead: u32,
    pub behind: u32,
}

/// The `# branch.*` header of `git status --porcelain=v2 -b`.
pub fn parse_branch(raw: &str) -> BranchState {
    let mut state = BranchState::default();
    for line in raw.lines() {
        if let Some(head) = line.strip_prefix("# branch.head ") {
            state.branch = (head != "(detached)").then(|| head.to_string());
        } else if line.starts_with("# branch.upstream ") {
            state.upstream = true;
        } else if let Some(ab) = line.strip_prefix("# branch.ab ") {
            for part in ab.split_whitespace() {
                let n = part[1..].parse().unwrap_or(0);
                if part.starts_with('+') {
                    state.ahead = n;
                } else {
                    state.behind = n;
                }
            }
        }
    }
    state
}

#[tauri::command(async)]
pub fn git_branch(path: String) -> Result<BranchState, String> {
    let raw = git(
        &path,
        &["status", "--porcelain=v2", "-b", "--untracked-files=no"],
    )?;
    let remotes = git(&path, &["remote"]).unwrap_or_default();
    Ok(BranchState {
        remote: !remotes.trim().is_empty(),
        ..parse_branch(&raw)
    })
}

#[tauri::command(async)]
pub fn git_checkout(path: String, branch: String) -> Result<(), String> {
    if branch.starts_with('-') {
        return Err(format!("{branch} is not a branch"));
    }
    locked(|| git(&path, &["checkout", &branch]).map(|_| ()))
}

/// The method GitHub pre-selects on its merge button: a merge commit, then squash, then rebase.
pub fn merge_flag(methods: &serde_json::Value) -> Option<&'static str> {
    [
        ("mergeCommitAllowed", "--merge"),
        ("squashMergeAllowed", "--squash"),
        ("rebaseMergeAllowed", "--rebase"),
    ]
    .into_iter()
    .find(|(key, _)| methods[key].as_bool() == Some(true))
    .map(|(_, flag)| flag)
}

/// Approves (best effort: GitHub refuses your own PR) and merges the branch's pull request.
#[tauri::command(async)]
pub fn pr_merge(path: String) -> Result<(), String> {
    let raw = tool(
        &path,
        "gh",
        &[
            "repo",
            "view",
            "--json",
            "mergeCommitAllowed,squashMergeAllowed,rebaseMergeAllowed",
        ],
    )
    .map_err(|_| "Could not read the repository's merge settings.".to_string())?;
    let methods: serde_json::Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    let flag = merge_flag(&methods).ok_or("The repository allows no merge method.")?;
    let _ = tool(&path, "gh", &["pr", "review", "--approve"]);
    tool(&path, "gh", &["pr", "merge", flag]).map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn branch_header_gives_ahead_and_behind() {
        let raw = "# branch.oid abc\n# branch.head feat/x\n# branch.upstream origin/feat/x\n# branch.ab +2 -1\n";
        assert_eq!(
            parse_branch(raw),
            BranchState {
                ahead: 2,
                behind: 1,
                branch: Some("feat/x".into()),
                remote: false,
                upstream: true
            }
        );
        assert_eq!(parse_branch("# branch.head (detached)\n").branch, None);
    }

    #[test]
    fn merge_method_follows_github() {
        let both = serde_json::json!({ "squashMergeAllowed": true, "rebaseMergeAllowed": true });
        assert_eq!(merge_flag(&both), Some("--squash"));
        assert_eq!(merge_flag(&serde_json::json!({})), None);
    }

    #[test]
    fn files_must_stay_inside() {
        assert!(inside("src/a.ts").is_ok());
        assert!(inside("../x").is_err());
        assert!(inside("/etc/passwd").is_err());
        assert!(inside("").is_err());
    }
}
