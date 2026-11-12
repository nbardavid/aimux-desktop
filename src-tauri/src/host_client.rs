//! The app's side of the background host: it starts the host when none answers, and turns the
//! webview's commands into requests on the host's socket.

use std::io::{BufRead, BufReader, Write};
use std::os::unix::net::UnixStream;
use std::os::unix::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use serde::Serialize;
use serde_json::Value;
use tauri::ipc::Channel;
use tauri::{AppHandle, Emitter, State};

use crate::host::{ChatStart, HostList, Request, TermStart, HOST_PROTOCOL};
use crate::store;

/// Whether the window's presence connection is held: the host counts the app as there while
/// it is open.
#[derive(Default)]
pub struct Presence(AtomicBool);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostStatus {
    protocol_ok: bool,
    list: HostList,
}

/// How long a freshly spawned host gets to open its socket.
const SPAWN_WAIT: Duration = Duration::from_secs(3);
const POLL: Duration = Duration::from_millis(50);

fn sock() -> PathBuf {
    store::data_dir().join("host.sock")
}

/// A connection to the host on `sock`; when none answers, the stale file goes and `exe --host`
/// starts in its own process group, so it outlives the app.
pub fn connect_or_spawn(sock: &Path, exe: &Path) -> Result<UnixStream, String> {
    if let Ok(s) = UnixStream::connect(sock) {
        return Ok(s);
    }
    let _ = std::fs::remove_file(sock);
    let dir = sock.parent().ok_or("bad host socket path")?;
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let log = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("host.log"))
        .map_err(|e| e.to_string())?;
    let mut child = Command::new(exe)
        .arg("--host")
        .process_group(0)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(log)
        .spawn()
        .map_err(|e| format!("background process: {e}"))?;
    // Reaped when it exits, or it lingers as a zombie of the app.
    std::thread::spawn(move || child.wait());
    for _ in 0..SPAWN_WAIT.as_millis() / POLL.as_millis() {
        std::thread::sleep(POLL);
        if let Ok(s) = UnixStream::connect(sock) {
            return Ok(s);
        }
    }
    Err("The background process did not start.".into())
}

fn connect() -> Result<UnixStream, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    connect_or_spawn(&sock(), &exe)
}

/// Writes `request` as a line on `s`, which then carries the answer or the stream.
fn send(mut s: UnixStream, request: &Request) -> Result<UnixStream, String> {
    let line = serde_json::to_string(request).map_err(|e| e.to_string())?;
    writeln!(s, "{line}").map_err(|e| e.to_string())?;
    Ok(s)
}

/// Sends `request` on a new connection, for streams and the presence.
fn open(request: &Request) -> Result<UnixStream, String> {
    send(connect()?, request)
}

/// The host's one-line answer to `request` on `s`, with its `error` as `Err`.
fn answer(s: UnixStream, request: &Request) -> Result<Value, String> {
    let mut line = String::new();
    BufReader::new(send(s, request)?)
        .read_line(&mut line)
        .map_err(|e| e.to_string())?;
    let v: Value = serde_json::from_str(&line)
        .map_err(|_| "The background process did not answer.".to_string())?;
    match v["error"].as_str() {
        Some(e) => Err(e.into()),
        None => Ok(v),
    }
}

/// The host's answer to `request`, from the host of this app's socket.
fn call(request: &Request) -> Result<Value, String> {
    answer(connect()?, request)
}

/// The answer of the host listening on `sock`, which must already be there: nothing is spawned.
fn call_at(sock: &Path, request: &Request) -> Result<Value, String> {
    answer(
        UnixStream::connect(sock).map_err(|e| e.to_string())?,
        request,
    )
}

/// The previous app's host socket, when a host of it answers: its chats still run there.
fn live_legacy_sock() -> Option<PathBuf> {
    let sock = store::legacy_data_dir()?.join("host.sock");
    UnixStream::connect(&sock).is_ok().then_some(sock)
}

/// Asks the host on `sock` to shut down and waits for its answer. Nothing answering is fine.
fn shut_down(sock: &Path) {
    if let Ok(mut s) = UnixStream::connect(sock) {
        let _ = writeln!(s, r#"{{"op":"shutdown"}}"#);
        let _ = BufReader::new(s).read_line(&mut String::new());
    }
}

/// Holds the presence connection for the app's life. When the host goes (a crash, a restart),
/// the next one is started and told the window is there, or it would stop chats as idle.
/// What the host asks of the window on it (for an agent) reaches the webview as `host-ask`.
fn hold_presence(presence: &Presence, app: &AppHandle) -> Result<(), String> {
    if presence.0.swap(true, Ordering::SeqCst) {
        return Ok(());
    }
    let mut held =
        open(&Request::Window).inspect_err(|_| presence.0.store(false, Ordering::SeqCst))?;
    let app = app.clone();
    std::thread::spawn(move || loop {
        // Until the host closes the connection.
        for line in BufReader::new(&held).lines().map_while(Result::ok) {
            if let Ok(v) = serde_json::from_str::<Value>(&line) {
                if v["ask"].is_object() {
                    let _ = app.emit("host-ask", &v["ask"]);
                }
            }
        }
        held = loop {
            std::thread::sleep(POLL);
            if let Ok(s) = open(&Request::Window) {
                break s;
            }
        };
    });
    Ok(())
}

/// Whether the running host speaks this app's protocol, and what it runs. A host that does
/// counts the window as there from now on.
#[tauri::command(async)]
pub fn host_status(presence: State<'_, Presence>, app: AppHandle) -> Result<HostStatus, String> {
    // Before anything could start a host: the previous app's host runs chats the window must
    // see, and only the window can say whether a restart cuts them (`hostDecision`).
    if let Some(legacy) = live_legacy_sock() {
        let list =
            serde_json::from_value(call_at(&legacy, &Request::List)?).map_err(|e| e.to_string())?;
        return Ok(HostStatus {
            protocol_ok: false,
            list,
        });
    }
    let protocol_ok = call(&Request::Hello)?["protocol"] == HOST_PROTOCOL;
    let list = serde_json::from_value(call(&Request::List)?).map_err(|e| e.to_string())?;
    if protocol_ok {
        hold_presence(&presence, &app)?;
    }
    Ok(HostStatus { protocol_ok, list })
}

/// Stops the host, everything it runs with it, and starts this app's.
#[tauri::command(async)]
pub fn host_restart(presence: State<'_, Presence>, app: AppHandle) -> Result<(), String> {
    let sock = sock();
    // The previous app's host stops too, with the chats it runs.
    let legacy = live_legacy_sock();
    if let Some(legacy) = &legacy {
        shut_down(legacy);
    }
    shut_down(&sock);
    for _ in 0..SPAWN_WAIT.as_millis() / POLL.as_millis() {
        if !sock.exists() && !legacy.as_ref().is_some_and(|l| l.exists()) {
            break;
        }
        std::thread::sleep(POLL);
    }
    connect()?;
    hold_presence(&presence, &app)
}

/// Sends a stream's request and returns its first line, read once the host has handled it:
/// a send that follows finds the process there.
fn open_stream(request: &Request) -> Result<(BufReader<UnixStream>, String), String> {
    let mut r = BufReader::new(open(request)?);
    let mut first = String::new();
    r.read_line(&mut first).map_err(|e| e.to_string())?;
    if let Ok(v) = serde_json::from_str::<Value>(&first) {
        if let Some(e) = v["error"].as_str() {
            return Err(e.into());
        }
    }
    Ok((r, first))
}

/// The chat's Claude, started from `start` unless the host runs it already: its lines since it
/// started, `logit_live`, then what it prints from now on.
#[tauri::command(async)]
pub fn chat_open(
    id: String,
    start: Option<ChatStart>,
    on_line: Channel<String>,
) -> Result<(), String> {
    let (reader, first) = open_stream(&Request::ChatOpen { id, start })?;
    std::thread::spawn(move || {
        let mut exited = false;
        for line in std::iter::once(Ok(first))
            .chain(reader.lines())
            .map_while(Result::ok)
        {
            let line = line.trim_end().to_string();
            exited = line == r#"{"type":"logit_exit"}"#;
            if on_line.send(line).is_err() {
                return;
            }
        }
        // The host went away with it.
        if !exited {
            let _ = on_line.send(r#"{"type":"logit_exit"}"#.into());
        }
    });
    Ok(())
}

/// The window's answer to a `host-ask`.
#[tauri::command(async)]
pub fn host_answer(ask_id: u64, result: Value) -> Result<(), String> {
    call(&Request::Answer { ask_id, result }).map(drop)
}

#[tauri::command(async)]
pub fn chat_send(id: String, line: String) -> Result<(), String> {
    call(&Request::ChatSend { id, line }).map(drop)
}

#[tauri::command(async)]
pub fn chat_stop(id: String) -> Result<(), String> {
    call(&Request::ChatStop { id }).map(drop)
}

/// The terminal, started from `start` unless the host runs it already: its output so far, then
/// live, and its exit code.
#[tauri::command(async)]
pub fn term_open(
    id: String,
    start: Option<TermStart>,
    on_data: Channel<String>,
    on_exit: Channel<Option<u32>>,
) -> Result<(), String> {
    let (reader, first) = open_stream(&Request::TermOpen { id, start })?;
    std::thread::spawn(move || {
        for line in std::iter::once(Ok(first))
            .chain(reader.lines())
            .map_while(Result::ok)
        {
            let Ok(v) = serde_json::from_str::<Value>(&line) else {
                continue;
            };
            if let Some(d) = v["d"].as_str() {
                if on_data.send(d.into()).is_err() {
                    return;
                }
            } else if let Some(exit) = v.get("exit") {
                let _ = on_exit.send(exit.as_u64().map(|c| c as u32));
                return;
            }
        }
        // The host went away with it.
        let _ = on_exit.send(None);
    });
    Ok(())
}

#[tauri::command(async)]
pub fn term_write(id: String, data: String) -> Result<(), String> {
    call(&Request::TermWrite { id, data }).map(drop)
}

#[tauri::command(async)]
pub fn term_resize(id: String, cols: u16, rows: u16) -> Result<(), String> {
    call(&Request::TermResize { id, cols, rows }).map(drop)
}

#[tauri::command(async)]
pub fn term_kill(id: String) -> Result<(), String> {
    call(&Request::TermKill { id }).map(drop)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::time::Duration;

    use crate::host;

    /// A short dir under /tmp (socket paths cap at 104 bytes), removed when the test ends.
    struct TempDir(PathBuf);

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn a_stale_socket_file_is_replaced() {
        let dir = TempDir(PathBuf::from(format!("/tmp/axc-{}", std::process::id())));
        std::fs::create_dir_all(&dir.0).unwrap();
        let sock = dir.0.join("host.sock");
        // A file, nobody listening.
        std::fs::write(&sock, b"").unwrap();
        // No real exe in tests: `serve` in a thread stands in for the spawned host.
        let exe = PathBuf::from("/usr/bin/true");
        let s = sock.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(100));
            host::serve(&s).unwrap()
        });
        assert!(connect_or_spawn(&sock, &exe).is_ok());
    }
}
