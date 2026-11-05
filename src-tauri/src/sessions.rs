//! The project's earlier Claude sessions, for `/resume`: Claude Code keeps one transcript per
//! session under `projects/<cwd as a slug>/<id>.jsonl`.

use std::path::{Path, PathBuf};

use serde::Serialize;

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub cwd: String,
    pub title: String,
    pub first_prompt: String,
    pub updated_at: u64,
    pub size_bytes: u64,
}

/// Claude names a transcript folder after the cwd, every non-alphanumeric char as `-`.
fn slug(path: &Path) -> String {
    path.to_string_lossy()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect()
}

pub fn sessions_in(root: &Path, roots: &[PathBuf]) -> Vec<Session> {
    let slugs: Vec<String> = roots.iter().map(|r| slug(r)).collect();
    let mut out: Vec<Session> = std::fs::read_dir(root)
        .into_iter()
        .flatten()
        .flatten()
        .filter(|d| {
            let name = d.file_name().to_string_lossy().into_owned();
            slugs.iter().any(|s| name.starts_with(s.as_str()))
        })
        .flat_map(|d| std::fs::read_dir(d.path()).into_iter().flatten().flatten())
        .filter_map(|f| session(&f.path(), roots))
        .collect();
    out.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    out
}

const HARNESS: [&str; 4] = ["<command-", "<local-command-", "<system-reminder", "<bash-"];

/// One transcript as a row, if it is a main session whose cwd lies in one of `roots`.
fn session(file: &Path, roots: &[PathBuf]) -> Option<Session> {
    use std::io::BufRead;
    let name = file.file_name()?.to_str()?;
    let id = name.strip_suffix(".jsonl")?;
    if id.starts_with("agent-") {
        return None;
    }
    let meta = std::fs::metadata(file).ok()?;
    let reader = std::io::BufReader::new(std::fs::File::open(file).ok()?);
    let (mut cwd, mut prompt) = (None::<String>, None::<String>);
    let (mut custom, mut ai) = (None::<String>, None::<String>);
    for line in reader.lines() {
        let Ok(line) = line else { break };
        let title_line =
            line.contains(r#""type":"custom-title""#) || line.contains(r#""type":"ai-title""#);
        let wants_cwd = cwd.is_none() && line.contains(r#""cwd":"#);
        let wants_prompt = prompt.is_none() && line.contains(r#""type":"user""#);
        if !(title_line || wants_cwd || wants_prompt) {
            continue;
        }
        let Ok(v) = serde_json::from_str::<serde_json::Value>(&line) else {
            continue;
        };
        if let Some(t) = v["customTitle"].as_str() {
            custom = Some(t.into());
        }
        if let Some(t) = v["aiTitle"].as_str() {
            ai = Some(t.into());
        }
        if wants_cwd {
            if let Some(c) = v["cwd"].as_str() {
                if !roots.iter().any(|r| Path::new(c).starts_with(r)) {
                    return None;
                }
                cwd = Some(c.into());
            }
        }
        if wants_prompt && v["type"] == "user" && v["isMeta"] != true {
            let content = &v["message"]["content"];
            let text = content.as_str().or_else(|| {
                content.as_array()?.iter().find(|b| b["type"] == "text")?["text"].as_str()
            });
            let text = text.unwrap_or("").trim();
            if !text.is_empty() && !HARNESS.iter().any(|h| text.starts_with(h)) {
                prompt = Some(text.chars().take(200).collect());
            }
        }
    }
    let updated_at = meta
        .modified()
        .ok()?
        .duration_since(std::time::UNIX_EPOCH)
        .ok()?
        .as_millis() as u64;
    Some(Session {
        id: id.into(),
        cwd: cwd?,
        title: custom.or(ai).unwrap_or_default(),
        first_prompt: prompt.unwrap_or_default(),
        updated_at,
        size_bytes: meta.len(),
    })
}

/// Every session of a project: its main checkout, its git worktrees, and the app's worktrees
/// folder for it (so deleted workspaces' sessions still show).
#[tauri::command(async)]
pub fn claude_sessions(project_id: String) -> Result<Vec<Session>, String> {
    let data = crate::store::data_dir();
    let raw = std::fs::read_to_string(data.join("catalog.json")).map_err(|e| e.to_string())?;
    let catalog: crate::store::Catalog = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    let project = catalog
        .projects
        .into_iter()
        .find(|p| p.id == project_id)
        .ok_or("unknown project")?;
    let mut roots = vec![
        PathBuf::from(&project.path),
        data.join("worktrees").join(&project.id),
    ];
    let listed = std::process::Command::new("git")
        .args(["worktree", "list", "--porcelain"])
        .current_dir(&project.path)
        .env("PATH", crate::git::tool_path())
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).into_owned())
        .unwrap_or_default();
    roots.extend(
        listed
            .lines()
            .filter_map(|l| l.strip_prefix("worktree "))
            .map(PathBuf::from),
    );
    let home = std::env::var("HOME").unwrap_or_default();
    let root = std::env::var("CLAUDE_CONFIG_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| Path::new(&home).join(".claude"))
        .join("projects");
    Ok(sessions_in(&root, &roots))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, UNIX_EPOCH};

    fn transcript(root: &Path, cwd: &str, id: &str, lines: &[serde_json::Value], at: u64) {
        let dir = root.join(slug(Path::new(cwd)));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join(format!("{id}.jsonl"));
        let body: Vec<String> = lines.iter().map(|l| l.to_string()).collect();
        std::fs::write(&file, body.join("\n")).unwrap();
        std::fs::File::options()
            .write(true)
            .open(&file)
            .unwrap()
            .set_modified(UNIX_EPOCH + Duration::from_secs(at))
            .unwrap();
    }

    #[test]
    fn lists_the_projects_sessions_newest_first() {
        use serde_json::json;
        let root = std::env::temp_dir().join(format!("aimux-sessions-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let user = |cwd: &str, text: &str| json!({ "cwd": cwd, "type": "user", "message": { "role": "user", "content": text } });
        transcript(
            &root,
            "/p/app",
            "a",
            &[
                json!({ "type": "custom-title", "customTitle": "Mine" }),
                user("/p/app", "<command-name>/clear</command-name>"),
                user("/p/app", "fix the tests"),
                json!({ "type": "ai-title", "aiTitle": "Auto" }),
            ],
            1_000,
        );
        transcript(
            &root,
            "/p/app/sub",
            "b",
            &[
                json!({ "cwd": "/p/app/sub", "type": "user", "isMeta": true, "message": { "content": "meta" } }),
                json!({ "cwd": "/p/app/sub", "type": "user", "message": { "content": [{ "type": "text", "text": "  hello  " }] } }),
            ],
            2_000,
        );
        transcript(
            &root,
            "/p/app-old",
            "c",
            &[user("/p/app-old", "elsewhere")],
            3_000,
        );
        transcript(&root, "/p/app", "agent-x", &[user("/p/app", "side")], 4_000);

        let got = sessions_in(&root, &[PathBuf::from("/p/app")]);
        let rows: Vec<_> = got
            .iter()
            .map(|s| {
                (
                    s.id.as_str(),
                    s.cwd.as_str(),
                    s.title.as_str(),
                    s.first_prompt.as_str(),
                    s.updated_at,
                )
            })
            .collect();
        assert_eq!(
            rows,
            [
                ("b", "/p/app/sub", "", "hello", 2_000_000),
                ("a", "/p/app", "Mine", "fix the tests", 1_000_000),
            ]
        );
        assert!(got[0].size_bytes > 0);
        let _ = std::fs::remove_dir_all(root);
    }
}
