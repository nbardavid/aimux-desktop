//! Terminal tabs: a shell on a pseudo-terminal, run by the background host for xterm.js.

use std::io::{Read, Write};

use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};

pub fn size(cols: u16, rows: u16) -> PtySize {
    PtySize {
        rows: rows.max(2),
        cols: cols.max(2),
        pixel_width: 0,
        pixel_height: 0,
    }
}

/// The longest prefix of `bytes` that is whole UTF-8; a character cut by the read waits.
pub fn utf8_cut(bytes: &[u8]) -> usize {
    match std::str::from_utf8(bytes) {
        Ok(_) => bytes.len(),
        // `error_len() == None`: the input ends inside a character, keep it for the next read.
        Err(e) if e.error_len().is_none() => e.valid_up_to(),
        Err(_) => bytes.len(),
    }
}

type Spawned = (
    Box<dyn MasterPty + Send>,
    Box<dyn portable_pty::Child + Send + Sync>,
    Box<dyn Read + Send>,
    Box<dyn Write + Send>,
);

/// The user's login shell in `cwd`, or `command` run by it (a setup script), on a new pty.
pub fn spawn(cwd: &str, cols: u16, rows: u16, command: Option<&str>) -> Result<Spawned, String> {
    let pair = native_pty_system()
        .openpty(size(cols, rows))
        .map_err(|e| e.to_string())?;
    let mut cmd = match command {
        Some(command) => {
            let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
            let mut cmd = CommandBuilder::new(shell);
            // Interactive too (`-i`): the shell reads ~/.zshrc, where tools put themselves on
            // the PATH (bun, nvm…), so a command finds what the user's terminal finds.
            cmd.args(["-l", "-i", "-c", command]);
            cmd
        }
        None => CommandBuilder::new_default_prog(),
    };
    cmd.cwd(cwd);
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    for (key, _) in std::env::vars() {
        if key == "CLAUDECODE" || key.starts_with("CLAUDE_CODE_") {
            cmd.env_remove(key);
        }
    }
    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    // The master reads EOF only once every slave end is closed: ours goes now.
    drop(pair.slave);
    let reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    Ok((pair.master, child, reader, writer))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_command_runs_on_the_pty_and_reports_its_exit() {
        let (_master, mut child, mut reader, _writer) =
            spawn("/tmp", 80, 24, Some("echo aimux-pty; exit 3")).unwrap();
        let mut out = String::new();
        let _ = reader.read_to_string(&mut out);
        assert!(out.contains("aimux-pty"), "{out:?}");
        assert_eq!(child.wait().unwrap().exit_code(), 3);
    }

    #[test]
    fn keeps_a_split_character_for_the_next_read() {
        let e = "é".as_bytes();
        assert_eq!(utf8_cut(&[b'a', e[0]]), 1);
        assert_eq!(utf8_cut(&[b'a', e[0], e[1]]), 3);
        // Invalid bytes are not waited on: they go out as replacement characters.
        assert_eq!(utf8_cut(&[0xff, b'a']), 2);
    }
}
