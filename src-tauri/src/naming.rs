//! A new workspace named from its first prompt, as the aimux TUI does: one quick headless
//! Claude call gives a title (the sidebar's name) and a `<type>/<subject>` branch. The folder
//! keeps its colour. Any failure leaves the colour name and the `logit/<colour>` branch.

use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use tauri::State;

use crate::git::tool_path;
use crate::store::{edit, Store, Workspace};

const TIMEOUT: Duration = Duration::from_secs(30);
const BRANCH_TYPES: &[&str] = &[
    "feat", "fix", "refactor", "perf", "docs", "test", "chore", "ci", "style", "build",
];

pub fn naming_prompt(request: &str) -> String {
    let request: String = request.chars().take(8000).collect();
    format!(
        "Name a workspace for the user request below.\n\
         Return exactly two lines and nothing else.\n\
         Line 1 — a tab title: 2 to 6 words, at most 48 characters, in the same language as the request.\n\
         Line 2 — a git branch named <type>/<subject>, always in English whatever the language of the request.\n\
         <type> is one of: {}.\n\
         <subject> is 2 to 5 lowercase words joined by hyphens, naming what changes rather than restating the request.\n\
         Example line 2: fix/scroll-drift-on-resize\n\
         No quotes, no labels, no numbering, no markdown, no ending punctuation.\n\n{request}",
        BRANCH_TYPES.join(", ")
    )
}

/// One line of the reply, unwrapped: no markdown, label, list marker or quotes.
fn unwrap_line(line: &str) -> &str {
    let mut s = line.trim().trim_matches('*').trim();
    for label in [
        "Title:", "title:", "Branch:", "branch:", "Line 1:", "Line 2:",
    ] {
        s = s.strip_prefix(label).unwrap_or(s).trim();
    }
    s = s.trim_start_matches(['-', '•', '#']).trim();
    if let Some((n, rest)) = s.split_once(['.', ')']) {
        if !n.is_empty() && n.chars().all(|c| c.is_ascii_digit()) {
            s = rest.trim();
        }
    }
    s.trim_matches(['"', '\'', '`', '“', '”', '«', '»']).trim()
}

/// 2 to 6 words, at most 48 characters cut at a word, no ending punctuation.
pub fn clamp_title(raw: &str) -> Option<String> {
    let words: Vec<&str> = raw.split_whitespace().take(6).collect();
    let mut title = String::new();
    for w in words {
        let next = if title.is_empty() {
            w.to_string()
        } else {
            format!("{title} {w}")
        };
        if next.chars().count() > 48 {
            break;
        }
        title = next;
    }
    let title = title
        .trim_end_matches(['.', '!', '?', ',', ';', ':', '…'])
        .to_string();
    (title.split_whitespace().count() >= 2).then_some(title)
}

/// `<type>/<subject>`: a known type, 2 to 5 lowercase ASCII words joined by hyphens.
pub fn clamp_branch(raw: &str) -> Option<String> {
    let (kind, subject) = raw.trim().split_once('/')?;
    let kind = kind.trim().to_lowercase();
    if !BRANCH_TYPES.contains(&kind.as_str()) {
        return None;
    }
    let words: Vec<String> = subject
        .to_lowercase()
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|w| !w.is_empty())
        .take(5)
        .map(String::from)
        .collect();
    (words.len() >= 2).then(|| format!("{kind}/{}", words.join("-")))
}

/// The reply's two lines: the title, and the branch when it is usable.
pub fn parse_naming(reply: &str) -> Option<(String, Option<String>)> {
    let mut lines = reply.lines().map(unwrap_line).filter(|l| !l.is_empty());
    let title = clamp_title(lines.next()?)?;
    Some((title, lines.next().and_then(clamp_branch)))
}

/// `claude -p` on the naming prompt, killed past the timeout.
fn ask_claude(request: &str) -> Option<String> {
    let mut cmd = Command::new("claude");
    cmd.args([
        "-p",
        "--model",
        "haiku",
        "--output-format",
        "text",
        "--no-session-persistence",
        "--strict-mcp-config",
    ])
    .arg(naming_prompt(request))
    // Away from the project: no CLAUDE.md to read for two lines.
    .current_dir(std::env::temp_dir())
    .env("PATH", tool_path())
    .stdin(Stdio::null())
    .stdout(Stdio::piped())
    .stderr(Stdio::null());
    for (key, _) in std::env::vars() {
        if key == "CLAUDECODE" || key.starts_with("CLAUDE_CODE_") {
            cmd.env_remove(key);
        }
    }
    cmd.env("CLAUDE_CODE_ENTRYPOINT", "logit");
    let mut child = cmd.spawn().ok()?;
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
            Ok(None) if start.elapsed() < TIMEOUT => std::thread::sleep(Duration::from_millis(100)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
        }
    };
    let out = reader.join().unwrap_or_default();
    status.success().then_some(out)
}

/// The colour a workspace was made with: its folder's name.
pub fn colour_of(w: &Workspace) -> String {
    Path::new(&w.path)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// Names a fresh workspace from `prompt`. Only one still on its colour name and branch: a
/// rename by the user meanwhile wins. A taken branch leaves the branch as it was.
#[tauri::command(async)]
pub fn workspace_autoname(
    store: State<'_, Store>,
    id: String,
    prompt: String,
) -> Result<Option<Workspace>, String> {
    if prompt.trim().is_empty() || prompt.trim_start().starts_with('/') {
        return Ok(None);
    }
    let Some((title, branch)) = ask_claude(&prompt).as_deref().and_then(parse_naming) else {
        return Ok(None);
    };
    edit(&store, |c| {
        let Some(w) = c.workspaces.iter_mut().find(|w| w.id == id) else {
            return Ok(None);
        };
        let colour = colour_of(w);
        if w.name != colour {
            return Ok(None);
        }
        if let Some(to) = branch {
            let renamed = [format!("logit/{colour}"), format!("aimux/{colour}")]
                .contains(&w.branch)
                && Command::new("git")
                    .args(["branch", "-m", &w.branch, &to])
                    .current_dir(&w.path)
                    .env("PATH", tool_path())
                    .output()
                    .is_ok_and(|o| o.status.success());
            if renamed {
                w.branch = to;
            }
        }
        w.name = title;
        Ok(Some(w.clone()))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_two_lines() {
        let reply = "**Title: Webhooks de facturation**\n- fix/Billing Webhook retries.\n";
        assert_eq!(
            parse_naming(reply),
            Some((
                "Webhooks de facturation".into(),
                Some("fix/billing-webhook-retries".into())
            ))
        );
    }

    #[test]
    fn keeps_the_title_without_a_usable_branch() {
        assert_eq!(
            parse_naming("Faster clean up\nwip/whatever-this-is"),
            Some(("Faster clean up".into(), None))
        );
        assert_eq!(parse_naming("Hello\nfeat/a-b"), None);
    }

    #[test]
    fn clamps_the_title() {
        assert_eq!(
            clamp_title("One two three four five six seven eight."),
            Some("One two three four five six".into())
        );
        assert_eq!(
            clamp_title("Supercalifragilistic expialidocious internationalisation!"),
            Some("Supercalifragilistic expialidocious".into())
        );
    }

    #[test]
    fn clamps_the_branch() {
        assert_eq!(
            clamp_branch("feat/add-one-two-three-four-five-six"),
            Some("feat/add-one-two-three-four".into())
        );
        assert_eq!(clamp_branch("feat/x"), None);
        assert_eq!(clamp_branch("logit/amber-two"), None);
    }
}
