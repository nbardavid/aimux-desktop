//! The background host: `aimux --host` owns the Claude chats and the terminals so they outlive
//! the window. It serves newline-delimited JSON on a Unix socket in the profile's data dir.

use std::collections::{HashMap, HashSet, VecDeque};
use std::io::{BufRead, BufReader, ErrorKind, Read, Write};
use std::os::unix::fs::PermissionsExt;
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::Path;
use std::process::{Child, ChildStdin};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant};

use portable_pty::{ChildKiller, MasterPty};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::chat::{claude_args, spawn_claude};
use crate::{pty, store};

/// Bumped by hand whenever a message or behaviour changes incompatibly. `hello`, `list` and
/// `shutdown` keep their shape in every version, so any app can always talk that much.
pub const HOST_PROTOCOL: u32 = 1;

/// About the 10 000 lines of xterm scrollback.
const TERM_BUFFER_BYTES: usize = 2 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum Request {
    Hello,
    List,
    Shutdown,
    Window,
    ChatOpen {
        id: String,
        start: Option<ChatStart>,
    },
    ChatSend {
        id: String,
        line: String,
    },
    ChatStop {
        id: String,
    },
    TermOpen {
        id: String,
        start: Option<TermStart>,
    },
    TermWrite {
        id: String,
        data: String,
    },
    TermResize {
        id: String,
        cols: u16,
        rows: u16,
    },
    TermKill {
        id: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatStart {
    pub cwd: String,
    pub resume: Option<String>,
    pub model: Option<String>,
    pub effort: Option<String>,
    pub history_len: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TermStart {
    pub cwd: String,
    pub cols: u16,
    pub rows: u16,
    pub command: Option<String>,
    pub workspace_id: String,
    pub title: String,
    /// Opaque to the host; the app marks its setup script `"setup"`.
    pub tag: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostChat {
    pub id: String,
    pub alive: bool,
    pub working: bool,
    pub waiting: bool,
    pub unread: bool,
    pub history_len: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostTerm {
    pub id: String,
    pub workspace_id: String,
    pub cwd: String,
    pub title: String,
    pub command: Option<String>,
    pub tag: Option<String>,
    pub ended: bool,
    pub code: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostList {
    pub chats: Vec<HostChat>,
    pub terms: Vec<HostTerm>,
}

/// What the host reads of a chat's stream: enough to know whether stopping it loses work, and
/// whether something happened that no window saw.
#[derive(Debug, Default)]
pub struct ChatFlags {
    pub working: bool,
    pub waiting: bool,
    pub unread: bool,
}

impl ChatFlags {
    /// A line Claude printed, with `windows` connected at the time.
    pub fn observe_out(&mut self, line: &str, windows: usize) {
        let Ok(m) = serde_json::from_str::<Value>(line) else {
            return;
        };
        match m["type"].as_str() {
            Some("result") => {
                self.working = false;
                self.waiting = false;
                self.unread |= windows == 0;
            }
            Some("control_request") if m["request"]["subtype"] == "can_use_tool" => {
                self.waiting = true;
                self.unread |= windows == 0;
            }
            Some("stream_event") => self.working = true,
            Some("system") if m["status"] == "requesting" => self.working = true,
            _ => {}
        }
    }

    /// A line the window sent to Claude.
    pub fn observe_in(&mut self, line: &str) {
        let Ok(m) = serde_json::from_str::<Value>(line) else {
            return;
        };
        match m["type"].as_str() {
            Some("user") => self.working = true,
            Some("control_response") => self.waiting = false,
            _ => {}
        }
    }
}

/// A terminal's output since it started, oldest dropped first past `TERM_BUFFER_BYTES`.
#[derive(Default)]
pub struct TermBuffer {
    chunks: VecDeque<String>,
    bytes: usize,
}

impl TermBuffer {
    pub fn push(&mut self, text: &str) {
        if text.len() > TERM_BUFFER_BYTES {
            let mut from = text.len() - TERM_BUFFER_BYTES;
            while !text.is_char_boundary(from) {
                from += 1;
            }
            self.chunks.clear();
            self.bytes = 0;
            return self.push(&text[from..]);
        }
        self.chunks.push_back(text.into());
        self.bytes += text.len();
        while self.bytes > TERM_BUFFER_BYTES {
            let Some(old) = self.chunks.pop_front() else {
                break;
            };
            self.bytes -= old.len();
        }
    }

    pub fn contents(&self) -> String {
        self.chunks.iter().map(String::as_str).collect()
    }
}

/// A line the window sent, wrapped so a replay can show it (`aimux_sent`); "" when the line is
/// not JSON, and the caller skips it.
pub fn sent_line(line: &str) -> String {
    match serde_json::from_str::<Value>(line) {
        Ok(message) => serde_json::json!({ "type": "aimux_sent", "message": message }).to_string(),
        Err(_) => String::new(),
    }
}

const SWEEP: Duration = Duration::from_secs(5);
/// Idle chats are stopped this long after the last window left; they resume when reopened.
const CHAT_IDLE: Duration = Duration::from_secs(300);
/// The host exits this long after the last window left, once nothing runs.
const HOST_IDLE: Duration = Duration::from_secs(60);
/// A window that stops reading loses its stream instead of stalling the whole host.
const WRITE_TIMEOUT: Duration = Duration::from_secs(5);

const EXIT: &str = r#"{"type":"aimux_exit"}"#;
const LIVE: &str = r#"{"type":"aimux_live"}"#;

struct ChatProc {
    /// Tells this process's reader threads apart from a later one under the same id.
    serial: u64,
    /// Taken by the stdout thread once Claude closes it, to reap it outside the lock.
    child: Option<Child>,
    stdin: ChildStdin,
    // ponytail: a chat's buffer keeps every line for the process's life; compact stream_event lines once onAssistant can rebuild multi-block messages from assistant lines alone.
    lines: Vec<String>,
    subs: Vec<UnixStream>,
    flags: ChatFlags,
    history_len: usize,
    ended: bool,
}

struct TermProc {
    serial: u64,
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
    output: TermBuffer,
    subs: Vec<UnixStream>,
    info: HostTerm,
}

struct State {
    serial: u64,
    chats: HashMap<String, ChatProc>,
    terms: HashMap<String, TermProc>,
    /// Chats stopped while flagged unread, until a `list` hands the flag to a window.
    unread: HashSet<String>,
    windows: usize,
    last_window_left: Instant,
}

type Shared = Arc<Mutex<State>>;

fn lock(state: &Shared) -> MutexGuard<'_, State> {
    state.lock().unwrap_or_else(|e| e.into_inner())
}

/// Writes `line` to every subscriber, dropping those that fail; true if one got it.
fn broadcast(subs: &mut Vec<UnixStream>, line: &str) -> bool {
    subs.retain_mut(|s| writeln!(s, "{line}").is_ok());
    !subs.is_empty()
}

/// The host on `data_dir()/host.sock`, until it exits.
pub fn run() {
    let dir = store::data_dir();
    let served = std::fs::create_dir_all(&dir).and_then(|()| serve(&dir.join("host.sock")));
    if let Err(e) = served {
        eprintln!("aimux host: {e}");
    }
}

/// Serves `sock` until the host has had nothing to do for a while. Returns at once, `Ok`, when
/// another host already answers there.
pub fn serve(sock: &Path) -> std::io::Result<()> {
    let listener = match UnixListener::bind(sock) {
        Ok(l) => l,
        Err(e) if e.kind() == ErrorKind::AddrInUse => {
            if UnixStream::connect(sock).is_ok() {
                return Ok(());
            }
            // Left by a host that died.
            std::fs::remove_file(sock)?;
            UnixListener::bind(sock)?
        }
        Err(e) => return Err(e),
    };
    std::fs::set_permissions(sock, std::fs::Permissions::from_mode(0o600))?;

    let state: Shared = Arc::new(Mutex::new(State {
        serial: 0,
        chats: HashMap::new(),
        terms: HashMap::new(),
        unread: HashSet::new(),
        windows: 0,
        last_window_left: Instant::now(),
    }));
    let accepting = state.clone();
    let path = sock.to_path_buf();
    std::thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            let state = accepting.clone();
            let path = path.clone();
            std::thread::spawn(move || {
                let _ = handle(&state, &path, stream);
            });
        }
    });

    loop {
        std::thread::sleep(SWEEP);
        let mut s = lock(&state);
        if s.windows > 0 {
            continue;
        }
        let idle = s.last_window_left.elapsed();
        if idle >= CHAT_IDLE {
            let st = &mut *s;
            st.chats.retain(|id, chat| {
                if chat.flags.working || chat.flags.waiting {
                    return true;
                }
                if chat.flags.unread {
                    st.unread.insert(id.clone());
                }
                if let Some(mut child) = chat.child.take() {
                    let _ = child.kill();
                    let _ = child.wait();
                }
                false
            });
        }
        if idle >= HOST_IDLE && s.chats.is_empty() && s.terms.is_empty() && s.unread.is_empty() {
            // Still under the lock: no request slips in between.
            let _ = std::fs::remove_file(sock);
            return Ok(());
        }
    }
}

fn reply(mut out: &UnixStream, result: Result<(), String>) -> std::io::Result<()> {
    let v = match result {
        Ok(()) => serde_json::json!({ "ok": true }),
        Err(e) => serde_json::json!({ "error": e }),
    };
    writeln!(out, "{v}")
}

fn handle(state: &Shared, sock: &Path, stream: UnixStream) -> std::io::Result<()> {
    // macOS refuses it (EINVAL) once the peer has hung up; the request is still worth reading.
    let _ = stream.set_write_timeout(Some(WRITE_TIMEOUT));
    let mut reader = BufReader::new(&stream);
    let mut line = String::new();
    reader.read_line(&mut line)?;
    let request = match serde_json::from_str::<Request>(&line) {
        Ok(r) => r,
        Err(e) => return reply(&stream, Err(e.to_string())),
    };
    match request {
        Request::Hello => writeln!(&stream, r#"{{"protocol":{HOST_PROTOCOL}}}"#),
        Request::List => writeln!(&stream, "{}", serde_json::to_string(&list(state))?),
        Request::Shutdown => {
            let mut s = lock(state);
            for chat in s.chats.values_mut() {
                if let Some(mut child) = chat.child.take() {
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
            for term in s.terms.values_mut() {
                let _ = term.killer.kill();
            }
            let _ = std::fs::remove_file(sock);
            let _ = reply(&stream, Ok(()));
            std::process::exit(0)
        }
        Request::Window => {
            lock(state).windows += 1;
            // Held open by the app for as long as it runs.
            let _ = std::io::copy(&mut reader, &mut std::io::sink());
            let mut s = lock(state);
            s.windows -= 1;
            if s.windows == 0 {
                s.last_window_left = Instant::now();
            }
            Ok(())
        }
        Request::ChatOpen { id, start } => chat_open(state, id, start, stream),
        Request::ChatSend { id, line } => reply(&stream, chat_send(state, &id, &line)),
        Request::ChatStop { id } => {
            let chat = lock(state).chats.remove(&id);
            if let Some(mut child) = chat.and_then(|c| c.child) {
                let _ = child.kill();
                let _ = child.wait();
            }
            reply(&stream, Ok(()))
        }
        Request::TermOpen { id, start } => term_open(state, id, start, stream),
        Request::TermWrite { id, data } => {
            let mut s = lock(state);
            let result = match s.terms.get_mut(&id).filter(|t| !t.info.ended) {
                Some(t) => t
                    .writer
                    .write_all(data.as_bytes())
                    .and_then(|()| t.writer.flush())
                    .map_err(|e| e.to_string()),
                None => Err("terminal is closed".into()),
            };
            reply(&stream, result)
        }
        Request::TermResize { id, cols, rows } => {
            let s = lock(state);
            let result = match s.terms.get(&id) {
                Some(t) => t
                    .master
                    .resize(pty::size(cols, rows))
                    .map_err(|e| e.to_string()),
                None => Err("terminal is closed".into()),
            };
            reply(&stream, result)
        }
        Request::TermKill { id } => {
            if let Some(mut t) = lock(state).terms.remove(&id) {
                let _ = t.killer.kill();
            }
            reply(&stream, Ok(()))
        }
    }
}

/// What runs, for a window attaching. The window now holds the unread flags, so they are
/// cleared here.
fn list(state: &Shared) -> HostList {
    let mut s = lock(state);
    // A plain shell that ended never comes back as a tab: nobody would collect it.
    s.terms
        .retain(|_, t| !(t.info.ended && t.info.command.is_none()));
    let mut chats: Vec<HostChat> = s
        .chats
        .iter_mut()
        .map(|(id, c)| {
            let chat = HostChat {
                id: id.clone(),
                alive: !c.ended,
                working: c.flags.working,
                waiting: c.flags.waiting,
                unread: c.flags.unread,
                history_len: c.history_len,
            };
            c.flags.unread = false;
            chat
        })
        .collect();
    chats.extend(s.unread.drain().map(|id| HostChat {
        id,
        alive: false,
        working: false,
        waiting: false,
        unread: true,
        history_len: 0,
    }));
    let terms = s.terms.values().map(|t| t.info.clone()).collect();
    HostList { chats, terms }
}

fn chat_open(
    state: &Shared,
    id: String,
    start: Option<ChatStart>,
    mut stream: UnixStream,
) -> std::io::Result<()> {
    let mut s = lock(state);
    let gone = s.chats.get(&id).is_none_or(|c| c.ended);
    if let Some(start) = start.filter(|_| gone) {
        let args = claude_args(
            start.resume.as_deref(),
            start.model.as_deref(),
            start.effort.as_deref(),
        );
        let mut child = match spawn_claude(&start.cwd, args) {
            Ok(child) => child,
            Err(e) => return writeln!(stream, "{}", serde_json::json!({ "error": e })),
        };
        let (Some(stdin), Some(stdout), Some(stderr)) =
            (child.stdin.take(), child.stdout.take(), child.stderr.take())
        else {
            let _ = child.kill();
            return writeln!(stream, r#"{{"error":"claude: no stdio"}}"#);
        };
        s.serial += 1;
        let serial = s.serial;
        let (st, cid) = (state.clone(), id.clone());
        std::thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                let line = serde_json::json!({ "type": "aimux_stderr", "text": line });
                chat_out(&st, &cid, serial, line.to_string(), false);
            }
        });
        let (st, cid) = (state.clone(), id.clone());
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                if !line.trim().is_empty() {
                    chat_out(&st, &cid, serial, line, true);
                }
            }
            chat_exit(&st, &cid, serial);
        });
        s.chats.insert(
            id.clone(),
            ChatProc {
                serial,
                child: Some(child),
                stdin,
                lines: Vec::new(),
                subs: Vec::new(),
                flags: ChatFlags::default(),
                history_len: start.history_len,
                ended: false,
            },
        );
    }
    // Replay then subscribe under one lock: no line is lost or doubled in between.
    let Some(chat) = s.chats.get_mut(&id) else {
        return writeln!(stream, "{EXIT}");
    };
    for line in &chat.lines {
        writeln!(stream, "{line}")?;
    }
    writeln!(stream, "{LIVE}")?;
    if chat.ended {
        writeln!(stream, "{EXIT}")?;
        s.chats.remove(&id);
    } else {
        chat.subs.push(stream);
    }
    Ok(())
}

fn chat_out(state: &Shared, id: &str, serial: u64, line: String, observe: bool) {
    let mut s = lock(state);
    let windows = s.windows;
    let Some(chat) = s.chats.get_mut(id).filter(|c| c.serial == serial) else {
        return;
    };
    if observe {
        chat.flags.observe_out(&line, windows);
    }
    broadcast(&mut chat.subs, &line);
    chat.lines.push(line);
}

fn chat_exit(state: &Shared, id: &str, serial: u64) {
    let child = {
        let mut s = lock(state);
        let Some(chat) = s.chats.get_mut(id).filter(|c| c.serial == serial) else {
            return;
        };
        chat.ended = true;
        chat.flags.working = false;
        chat.flags.waiting = false;
        let child = chat.child.take();
        // Kept until a window has seen the exit.
        if broadcast(&mut chat.subs, EXIT) {
            s.chats.remove(id);
        }
        child
    };
    if let Some(mut child) = child {
        let _ = child.wait();
    }
}

fn chat_send(state: &Shared, id: &str, line: &str) -> Result<(), String> {
    let mut s = lock(state);
    let chat = s
        .chats
        .get_mut(id)
        .filter(|c| !c.ended)
        .ok_or("chat is closed")?;
    writeln!(chat.stdin, "{line}")
        .and_then(|()| chat.stdin.flush())
        .map_err(|e| e.to_string())?;
    chat.flags.observe_in(line);
    // Replay only: the window that sent it already shows it.
    let sent = sent_line(line);
    if !sent.is_empty() {
        chat.lines.push(sent);
    }
    Ok(())
}

fn term_open(
    state: &Shared,
    id: String,
    start: Option<TermStart>,
    mut stream: UnixStream,
) -> std::io::Result<()> {
    let mut s = lock(state);
    let gone = s.terms.get(&id).is_none_or(|t| t.info.ended);
    if let Some(start) = start.filter(|_| gone) {
        let spawned = pty::spawn(&start.cwd, start.cols, start.rows, start.command.as_deref());
        let (master, mut child, mut reader, writer) = match spawned {
            Ok(spawned) => spawned,
            Err(e) => return writeln!(stream, "{}", serde_json::json!({ "error": e })),
        };
        let killer = child.clone_killer();
        s.serial += 1;
        let serial = s.serial;
        let (st, tid) = (state.clone(), id.clone());
        std::thread::spawn(move || {
            let mut buf = vec![0u8; 16 * 1024];
            let mut carry: Vec<u8> = Vec::new();
            while let Ok(n) = reader.read(&mut buf) {
                if n == 0 {
                    break;
                }
                carry.extend_from_slice(&buf[..n]);
                let cut = pty::utf8_cut(&carry);
                let text = String::from_utf8_lossy(&carry[..cut]).into_owned();
                carry.drain(..cut);
                if !text.is_empty() {
                    term_out(&st, &tid, serial, &text);
                }
            }
            let code = child.wait().ok().map(|status| status.exit_code());
            term_exit(&st, &tid, serial, code);
        });
        let info = HostTerm {
            id: id.clone(),
            workspace_id: start.workspace_id,
            cwd: start.cwd,
            title: start.title,
            command: start.command,
            tag: start.tag,
            ended: false,
            code: None,
        };
        s.terms.insert(
            id.clone(),
            TermProc {
                serial,
                master,
                writer,
                killer,
                output: TermBuffer::default(),
                subs: Vec::new(),
                info,
            },
        );
    }
    let Some(term) = s.terms.get_mut(&id) else {
        return writeln!(stream, r#"{{"exit":null}}"#);
    };
    let text = term.output.contents();
    if !text.is_empty() {
        writeln!(stream, "{}", serde_json::json!({ "d": text }))?;
    }
    writeln!(stream, r#"{{"live":true}}"#)?;
    if term.info.ended {
        writeln!(stream, "{}", serde_json::json!({ "exit": term.info.code }))?;
        s.terms.remove(&id);
    } else {
        term.subs.push(stream);
    }
    Ok(())
}

fn term_out(state: &Shared, id: &str, serial: u64, text: &str) {
    let mut s = lock(state);
    let Some(term) = s.terms.get_mut(id).filter(|t| t.serial == serial) else {
        return;
    };
    broadcast(
        &mut term.subs,
        &serde_json::json!({ "d": text }).to_string(),
    );
    term.output.push(text);
}

fn term_exit(state: &Shared, id: &str, serial: u64, code: Option<u32>) {
    let mut s = lock(state);
    let Some(term) = s.terms.get_mut(id).filter(|t| t.serial == serial) else {
        return;
    };
    term.info.ended = true;
    term.info.code = code;
    // Kept, listed as ended, until a window has seen the exit: a setup script records it so.
    if broadcast(
        &mut term.subs,
        &serde_json::json!({ "exit": code }).to_string(),
    ) {
        s.terms.remove(id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_turn_finished_with_no_window_is_unread() {
        let mut f = ChatFlags::default();
        f.observe_in(r#"{"type":"user","message":{}}"#);
        assert!(f.working);
        f.observe_out(r#"{"type":"result","subtype":"success"}"#, 0);
        assert!(!f.working && f.unread);
    }

    #[test]
    fn a_turn_finished_in_front_of_a_window_is_not_unread() {
        let mut f = ChatFlags::default();
        f.observe_out(r#"{"type":"result","subtype":"success"}"#, 1);
        assert!(!f.unread);
    }

    #[test]
    fn a_permission_waits_until_answered() {
        let mut f = ChatFlags::default();
        f.observe_out(
            r#"{"type":"control_request","request":{"subtype":"can_use_tool"}}"#,
            1,
        );
        assert!(f.waiting);
        f.observe_in(r#"{"type":"control_response","response":{}}"#);
        assert!(!f.waiting);
    }

    #[test]
    fn term_buffer_drops_the_oldest_output() {
        let mut b = TermBuffer::default();
        b.push(&"a".repeat(TERM_BUFFER_BYTES));
        b.push("tail");
        assert!(b.contents().ends_with("tail"));
        assert!(b.contents().len() <= TERM_BUFFER_BYTES);
    }

    #[test]
    fn requests_use_snake_case_ops() {
        let r: Request = serde_json::from_str(r#"{"op":"term_kill","id":"t1"}"#).unwrap();
        assert!(matches!(r, Request::TermKill { id } if id == "t1"));
    }

    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::time::Duration;

    /// A socket path removed when the test ends; the test's host thread dies with the binary.
    struct TempSock(PathBuf);

    impl Drop for TempSock {
        fn drop(&mut self) {
            let _ = std::fs::remove_file(&self.0);
        }
    }

    impl std::ops::Deref for TempSock {
        type Target = std::path::Path;
        fn deref(&self) -> &std::path::Path {
            &self.0
        }
    }

    // macOS caps socket paths at 104 bytes: no deep temp dir.
    fn temp_sock() -> TempSock {
        static N: AtomicU32 = AtomicU32::new(0);
        let n = N.fetch_add(1, Ordering::Relaxed);
        TempSock(PathBuf::from(format!(
            "/tmp/axh-{}-{n}.sock",
            std::process::id()
        )))
    }

    fn spawn_serve(sock: &std::path::Path) {
        let s = sock.to_path_buf();
        std::thread::spawn(move || serve(&s).unwrap());
        for _ in 0..100 {
            if UnixStream::connect(sock).is_ok() {
                return;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        panic!("the host did not start");
    }

    fn open(sock: &std::path::Path, json: &str) -> BufReader<UnixStream> {
        let mut s = UnixStream::connect(sock).unwrap();
        s.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
        writeln!(s, "{json}").unwrap();
        BufReader::new(s)
    }

    fn request(sock: &std::path::Path, json: &str) -> Value {
        let mut line = String::new();
        open(sock, json).read_line(&mut line).unwrap();
        serde_json::from_str(&line).unwrap()
    }

    fn read_until(r: &mut BufReader<UnixStream>, needle: &str) -> bool {
        let mut line = String::new();
        loop {
            line.clear();
            match r.read_line(&mut line) {
                Ok(0) | Err(_) => return false,
                Ok(_) if line.contains(needle) => return true,
                Ok(_) => {}
            }
        }
    }

    #[test]
    fn a_terminal_outlives_its_window_and_replays() {
        let sock = temp_sock();
        spawn_serve(&sock);
        let mut a = open(
            &sock,
            r#"{"op":"term_open","id":"t1","start":{"cwd":"/tmp","cols":80,"rows":24,"command":"echo aimux-host","workspaceId":"w","title":"T","tag":"setup"}}"#,
        );
        assert!(read_until(&mut a, "\"exit\":0"));
        drop(a);
        let list = request(&sock, r#"{"op":"list"}"#);
        // The exit reached `a`, so the ended entry is gone.
        assert_eq!(list["terms"].as_array().unwrap().len(), 0);
    }

    #[test]
    fn an_ended_terminal_waits_for_a_window_to_see_its_exit() {
        let sock = temp_sock();
        spawn_serve(&sock);
        let a = open(
            &sock,
            r#"{"op":"term_open","id":"t2","start":{"cwd":"/tmp","cols":80,"rows":24,"command":"sleep 0.3; echo done-late","workspaceId":"w","title":"T","tag":"setup"}}"#,
        );
        drop(a);
        // The shell reads the user's rc files first (`-i`): give it time, without a fixed wait.
        let mut list = request(&sock, r#"{"op":"list"}"#);
        for _ in 0..100 {
            if list["terms"][0]["ended"] == true {
                break;
            }
            std::thread::sleep(Duration::from_millis(100));
            list = request(&sock, r#"{"op":"list"}"#);
        }
        assert_eq!(list["terms"][0]["ended"], true);
        assert_eq!(list["terms"][0]["tag"], "setup");
        let mut b = open(&sock, r#"{"op":"term_open","id":"t2"}"#);
        assert!(read_until(&mut b, "done-late"));
        assert!(read_until(&mut b, "\"exit\":0"));
    }

    #[test]
    fn hello_reports_the_protocol() {
        let sock = temp_sock();
        spawn_serve(&sock);
        assert_eq!(
            request(&sock, r#"{"op":"hello"}"#)["protocol"],
            HOST_PROTOCOL
        );
        let mode = std::fs::metadata(&*sock).unwrap().permissions().mode();
        assert_eq!(mode & 0o777, 0o600);
    }

    #[test]
    fn a_second_host_leaves_a_live_socket_alone() {
        let sock = temp_sock();
        spawn_serve(&sock);
        assert!(serve(&sock).is_ok()); // returns at once
        assert_eq!(
            request(&sock, r#"{"op":"hello"}"#)["protocol"],
            HOST_PROTOCOL
        );
    }
}
