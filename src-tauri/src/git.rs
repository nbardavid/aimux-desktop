//! Git and gh reads for the git panel (writes live in `git_write`). Fixed argument lists: the
//! webview names a workspace path and a file, never a git subcommand.

use std::collections::HashMap;
use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use serde::Serialize;

#[derive(Debug, PartialEq, Serialize)]
pub struct FileChange {
    pub path: String,
    pub status: char,
    pub untracked: bool,
    /// Something of it sits in the index (`git commit` would take it).
    pub staged: bool,
    /// Something of it differs from the index in the working tree.
    pub unstaged: bool,
    pub add: Option<u32>,
    pub del: Option<u32>,
}

pub struct Entry {
    pub status: char,
    pub untracked: bool,
    pub staged: bool,
    pub unstaged: bool,
    pub path: String,
}

/// `git status --porcelain=v1 -z`: `XY path\0`, plus `orig\0` after a rename or copy.
/// X is the index side, Y the working tree side.
pub fn parse_porcelain(raw: &str) -> Vec<Entry> {
    let mut out = Vec::new();
    let mut fields = raw.split('\0').filter(|f| !f.is_empty());
    while let Some(entry) = fields.next() {
        if entry.len() < 4 {
            continue;
        }
        let mut chars = entry.chars();
        let (x, y) = (chars.next().unwrap_or(' '), chars.next().unwrap_or(' '));
        let path = entry[3..].to_string();
        if matches!(x, 'R' | 'C') {
            fields.next();
        }
        let untracked = x == '?';
        out.push(Entry {
            path,
            staged: !untracked && x != ' ',
            status: if untracked {
                'A'
            } else if x != ' ' {
                x
            } else {
                y
            },
            unstaged: !untracked && y != ' ',
            untracked,
        });
    }
    out
}

/// `git diff --numstat -z`: `add\tdel\tpath\0`, or `add\tdel\t\0old\0new\0` for a rename.
/// Binary files report `-` and map to `None`.
pub fn parse_numstat(raw: &str) -> HashMap<String, (Option<u32>, Option<u32>)> {
    let mut out = HashMap::new();
    let mut fields = raw.split('\0');
    while let Some(entry) = fields.next() {
        let mut parts = entry.splitn(3, '\t');
        let (Some(add), Some(del), Some(path)) = (parts.next(), parts.next(), parts.next()) else {
            continue;
        };
        let path = if path.is_empty() {
            fields.next();
            fields.next().unwrap_or_default().to_string()
        } else {
            path.to_string()
        };
        out.insert(path, (add.parse().ok(), del.parse().ok()));
    }
    out
}

/// Lines of an untracked file, `None` for binary or large files.
fn count_lines(file: &Path) -> Option<u32> {
    let bytes = std::fs::read(file).ok()?;
    if bytes.len() > 2 * 1024 * 1024 || bytes.contains(&0) {
        return None;
    }
    let newlines = bytes.iter().filter(|&&b| b == b'\n').count() as u32;
    Some(if bytes.last().is_some_and(|&b| b != b'\n') {
        newlines + 1
    } else {
        newlines
    })
}

pub fn tool_path() -> String {
    let home = std::env::var("HOME").unwrap_or_default();
    let path = std::env::var("PATH").unwrap_or_default();
    // A Finder launch gets a bare PATH: add where bun, claude, git and gh usually live.
    format!("{home}/.bun/bin:{home}/.local/bin:/opt/homebrew/bin:/usr/local/bin:{path}")
}

fn run(program: &str, cwd: &str, args: &[&str]) -> Result<(bool, String), String> {
    let output = Command::new(program)
        .args(args)
        .current_dir(cwd)
        .env("PATH", tool_path())
        .output()
        .map_err(|e| format!("{program}: {e}"))?;
    Ok((
        output.status.success(),
        String::from_utf8_lossy(&output.stdout).into_owned(),
    ))
}

#[tauri::command(async)]
pub fn git_status(path: String) -> Result<Vec<FileChange>, String> {
    let (ok, status) = run(
        "git",
        &path,
        &["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    )?;
    if !ok {
        return Err(format!("{path} is not a git repository"));
    }
    // A repository without commits has no HEAD to diff against: counts stay empty.
    let numstat = run("git", &path, &["diff", "--numstat", "-z", "HEAD"])
        .map(|(_, out)| parse_numstat(&out))?;
    Ok(parse_porcelain(&status)
        .into_iter()
        .map(|e| {
            let (add, del) = if e.untracked {
                (count_lines(&Path::new(&path).join(&e.path)), Some(0))
            } else {
                numstat.get(&e.path).copied().unwrap_or((None, None))
            };
            FileChange {
                add,
                del,
                path: e.path,
                staged: e.staged,
                status: e.status,
                unstaged: e.unstaged,
                untracked: e.untracked,
            }
        })
        .collect())
}

#[tauri::command(async)]
pub fn git_diff(path: String, file: String, untracked: bool) -> Result<String, String> {
    let args: &[&str] = if untracked {
        &["diff", "--no-color", "--no-index", "--", "/dev/null", &file]
    } else {
        &["diff", "--no-color", "HEAD", "--", &file]
    };
    // `--no-index` exits 1 when the files differ, which is always: read stdout either way.
    run("git", &path, args).map(|(_, out)| out)
}

/// How long `gh` may take: past it (a network gone quiet after sleep), it is killed, so the
/// panel's polling never waits on a request that will not answer.
const GH_TIMEOUT: Duration = Duration::from_secs(20);

/// `run`, killed after `limit`: `None` when it did not finish or failed to start.
fn run_within(program: &str, cwd: &str, args: &[&str], limit: Duration) -> Option<(bool, String)> {
    let mut child = Command::new(program)
        .args(args)
        .current_dir(cwd)
        .env("PATH", tool_path())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    // Read stdout on the side: a full pipe would block the child before it exits.
    let mut stdout = child.stdout.take()?;
    let reader = std::thread::spawn(move || {
        let mut out = String::new();
        let _ = stdout.read_to_string(&mut out);
        out
    });
    let start = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if start.elapsed() < limit => std::thread::sleep(Duration::from_millis(50)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
        }
    };
    Some((status.success(), reader.join().unwrap_or_default()))
}

/// The branch's pull request as `gh` reports it, or `None` without gh or without a PR. An
/// error when gh did not answer in time: the panel keeps what it showed.
#[tauri::command(async)]
pub fn pr_view(path: String) -> Result<Option<String>, String> {
    let fields = "number,title,state,isDraft,url,additions,deletions,changedFiles,body,\
                  statusCheckRollup,mergeable,mergeStateStatus,baseRefName,headRefName";
    match run_within("gh", &path, &["pr", "view", "--json", fields], GH_TIMEOUT) {
        Some((true, out)) => Ok(Some(out)),
        Some((false, _)) => Ok(None),
        None => Err("gh did not answer".into()),
    }
}

#[derive(Serialize)]
pub struct Branches {
    /// Local branches, most recently committed first, as the TUI lists them.
    branches: Vec<String>,
    /// What a new workspace forks from unless you pick another: the TUI's `getDefaultBranch`.
    default: Option<String>,
}

#[tauri::command(async)]
pub fn git_branches(path: String) -> Result<Branches, String> {
    let (ok, out) = run(
        "git",
        &path,
        &[
            "for-each-ref",
            "--sort=-committerdate",
            "refs/heads",
            "--format=%(refname:short)",
        ],
    )?;
    if !ok {
        return Err(format!("{path} is not a git repository"));
    }
    let branches: Vec<String> = out
        .lines()
        .filter(|l| !l.is_empty())
        .map(String::from)
        .collect();
    let origin = match run(
        "git",
        &path,
        &["symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
    ) {
        Ok((true, head)) => {
            let head = head.trim();
            Some(head.strip_prefix("origin/").unwrap_or(head).to_string())
        }
        _ => None,
    };
    let default = origin
        .filter(|b| branches.contains(b))
        .or_else(|| {
            ["main", "master"]
                .iter()
                .map(|b| b.to_string())
                .find(|b| branches.contains(b))
        })
        .or_else(|| branches.first().cloned());
    Ok(Branches { branches, default })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn porcelain_maps_modified_untracked_and_renamed() {
        let raw = " M src/a.ts\0?? new.sh\0R  b.ts\0old-b.ts\0MM both.ts\0";
        let got: Vec<_> = parse_porcelain(raw)
            .into_iter()
            .map(|e| (e.status, e.untracked, e.staged, e.unstaged, e.path))
            .collect();
        assert_eq!(
            got,
            vec![
                ('M', false, false, true, "src/a.ts".to_string()),
                ('A', true, false, false, "new.sh".to_string()),
                ('R', false, true, false, "b.ts".to_string()),
                ('M', false, true, true, "both.ts".to_string()),
            ]
        );
    }

    #[test]
    fn a_command_past_its_limit_is_killed() {
        let started = Instant::now();
        assert_eq!(
            run_within("sleep", "/", &["5"], Duration::from_millis(200)),
            None
        );
        assert!(started.elapsed() < Duration::from_secs(2));
        assert_eq!(
            run_within("echo", "/", &["hi"], Duration::from_secs(5)),
            Some((true, "hi\n".to_string()))
        );
    }

    #[test]
    fn numstat_handles_binary_and_renames() {
        let raw = "13\t6\tsrc/a.ts\0-\t-\tdemo.gif\x002\t1\t\0old.ts\0new.ts\0";
        let stats = parse_numstat(raw);
        assert_eq!(stats["src/a.ts"], (Some(13), Some(6)));
        assert_eq!(stats["demo.gif"], (None, None));
        assert_eq!(stats["new.ts"], (Some(2), Some(1)));
    }
}
