//! Read-only git and gh calls for the git panel. Fixed argument lists: the webview names a
//! workspace path and a file, never a git subcommand.

use std::collections::HashMap;
use std::path::Path;
use std::process::Command;

use serde::Serialize;

#[derive(Debug, PartialEq, Serialize)]
pub struct FileChange {
    pub path: String,
    pub status: char,
    pub untracked: bool,
    pub add: Option<u32>,
    pub del: Option<u32>,
}

/// `git status --porcelain=v1 -z`: `XY path\0`, plus `orig\0` after a rename or copy.
pub fn parse_porcelain(raw: &str) -> Vec<(char, bool, String)> {
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
        if x == '?' {
            out.push(('A', true, path));
        } else {
            out.push((if x != ' ' { x } else { y }, false, path));
        }
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
    // A Finder launch gets a bare PATH: add where bun, git and gh usually live.
    format!("{home}/.bun/bin:/opt/homebrew/bin:/usr/local/bin:{path}")
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
        .map(|(status, untracked, file)| {
            let (add, del) = if untracked {
                (count_lines(&Path::new(&path).join(&file)), Some(0))
            } else {
                numstat.get(&file).copied().unwrap_or((None, None))
            };
            FileChange {
                add,
                del,
                path: file,
                status,
                untracked,
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

/// The branch's pull request as `gh` reports it, or `None` without gh or without a PR.
#[tauri::command(async)]
pub fn pr_view(path: String) -> Option<String> {
    let fields =
        "number,title,state,isDraft,url,additions,deletions,changedFiles,body,statusCheckRollup";
    match run("gh", &path, &["pr", "view", "--json", fields]) {
        Ok((true, out)) => Some(out),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn porcelain_maps_modified_untracked_and_renamed() {
        let raw = " M src/a.ts\0?? new.sh\0R  b.ts\0old-b.ts\0D  gone.ts\0";
        assert_eq!(
            parse_porcelain(raw),
            vec![
                ('M', false, "src/a.ts".to_string()),
                ('A', true, "new.sh".to_string()),
                ('R', false, "b.ts".to_string()),
                ('D', false, "gone.ts".to_string()),
            ]
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
