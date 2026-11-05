# Background Host Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claude chats and terminals run in a detached host process (`aimux --host`) that
outlives the window; the window reattaches to them at launch.

**Architecture:** The app's own binary started with `--host` serves a Unix socket at
`store::data_dir()/host.sock`. One short-lived connection per request (one JSON line in, one
JSON line out); `chat_open` / `term_open` connections stay open and stream replay then live
output; a `window` connection is held open by each running app for presence. The Tauri
commands become thin forwards; the webview keeps its Channel-based hooks.

**Tech Stack:** Rust std only (`std::os::unix::net`, threads), serde_json, portable-pty (already
there); React/TypeScript hooks; bun test, cargo test.

**Spec:** `docs/superpowers/specs/2026-11-05-background-host-design.md`

## Global Constraints

- No TCP, no new crate. Socket mode `0o600`, in `store::data_dir()` (honours `AIMUX_PROFILE`,
  `AIMUX_DESKTOP_HOME`).
- `HOST_PROTOCOL: u32 = 1`. `hello`, `list`, `shutdown` keep their shape in every version.
- Host is `std::env::current_exe()` with `--host`, spawned with
  `CommandExt::process_group(0)`, stdin/stdout null, stderr appended to `data_dir()/host.log`.
- Timings: idle chats stopped `300 s` after the last window left; host exits `60 s` after the
  last window left once its table is empty; sweep every `5 s`; app waits up to `3 s` for a
  freshly spawned host's socket.
- Terminal replay buffer: `2 MiB` per terminal, oldest output dropped first.
- English everywhere; bun only; no modal (inline two-click confirm); commit only with the
  owner's approval for that commit (the repo has no commit yet: ask before the first one).
- Trials with `AIMUX_PROFILE=gui-dev` only. Until the dev/prod project lands, a dev build on
  the default profile would attach to the prod host: never run dev without the profile.

## Review Focus

- Host already running an older protocol at launch, with work in it → bar, nothing started,
  no second Claude on a session (Task 5 test: mismatch with a working chat yields `blocked`).
- Two app windows/launches racing to spawn the host → exactly one host, both attach (Task 2
  test: second `serve` on a live socket returns `Ok` without stealing it).
- Stale `host.sock` left by a crashed host → app removes it and spawns (Task 3 test).
- Reattach must not fire attention for replayed lines, nor show a permission already answered
  (Task 4 test: replayed `aimux_sent` control_response clears the pending permission).
- A setup script that finished while the window was closed still records `setup_ran`
  (Task 2 test: ended terminal stays listed until its exit is delivered once).

---

### Task 1: Host protocol and per-process state

**Files:**

- Create: `src-tauri/src/host.rs`
- Modify: `src-tauri/src/lib.rs` (add `pub mod host;`)
- Test: `src-tauri/src/host.rs` (`#[cfg(test)] mod tests`)

**Interfaces:**

- Produces (all `pub` in `host.rs`; structs crossing to JS use `#[serde(rename_all = "camelCase")]`):
  - `pub const HOST_PROTOCOL: u32 = 1;`
  - `#[serde(tag = "op", rename_all = "snake_case")] pub enum Request { Hello, List, Shutdown, Window, ChatOpen { id: String, start: Option<ChatStart> }, ChatSend { id: String, line: String }, ChatStop { id: String }, TermOpen { id: String, start: Option<TermStart> }, TermWrite { id: String, data: String }, TermResize { id: String, cols: u16, rows: u16 }, TermKill { id: String } }`
  - `pub struct ChatStart { cwd: String, resume: Option<String>, model: Option<String>, effort: Option<String>, history_len: usize }`
  - `pub struct TermStart { cwd: String, cols: u16, rows: u16, command: Option<String>, workspace_id: String, title: String, tag: Option<String> }` (`tag` is opaque to the host; the app uses `"setup"`)
  - `pub struct HostChat { id: String, alive: bool, working: bool, waiting: bool, unread: bool, history_len: usize }`
  - `pub struct HostTerm { id: String, workspace_id: String, cwd: String, title: String, command: Option<String>, tag: Option<String>, ended: bool, code: Option<u32> }`
  - `pub struct HostList { chats: Vec<HostChat>, terms: Vec<HostTerm> }`
  - `#[derive(Default)] pub struct ChatFlags { pub working: bool, pub waiting: bool, pub unread: bool }` with
    `pub fn observe_out(&mut self, line: &str, windows: usize)` and `pub fn observe_in(&mut self, line: &str)`
  - `pub struct TermBuffer` with `pub fn push(&mut self, text: &str)` and `pub fn contents(&self) -> String`, capped at `TERM_BUFFER_BYTES = 2 * 1024 * 1024`
  - `pub fn sent_line(line: &str) -> String` → `{"type":"aimux_sent","message":<line parsed as JSON>}` (an unparsable line yields `None`-like: return the empty string and the caller skips it)

Flag rules: out `result` → working=false, waiting=false, unread |= windows==0; out
`control_request` with `request.subtype == "can_use_tool"` → waiting=true,
unread |= windows==0; out `stream_event`, or `system` with `status == "requesting"` →
working=true. In `user` → working=true; in `control_response` → waiting=false.

- [ ] **Step 1: Write the failing tests**

```rust
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
    f.observe_out(r#"{"type":"control_request","request":{"subtype":"can_use_tool"}}"#, 1);
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
```

- [ ] **Step 2: Run them, expect compile failure**

Run: `cd src-tauri && cargo test host::`
Expected: FAIL, `ChatFlags` / `TermBuffer` / `Request` not found.

- [ ] **Step 3: Implement the types and functions above in `host.rs`**

`TermBuffer` holds a `VecDeque<String>` of chunks and a byte count; drop whole chunks from the
front while over the cap (a chunk alone over the cap keeps only its tail, cut on a char
boundary).

- [ ] **Step 4: Run them, expect PASS**

Run: `cd src-tauri && cargo test host::`

- [ ] **Step 5: Commit (ask first)** — `feat(host): protocol and per-process state`

---

### Task 2: The host server

**Files:**

- Modify: `src-tauri/src/host.rs`, `src-tauri/src/main.rs`, `src-tauri/src/chat.rs`
- Test: `src-tauri/src/host.rs`

**Interfaces:**

- Consumes: Task 1 types; `pty::spawn`, `pty::utf8_cut`, `git::tool_path`, `chat::claude_args`.
- Produces:
  - `chat.rs`: `pub fn spawn_claude(cwd: &str, args: Vec<String>) -> Result<std::process::Child, String>` (piped stdio, `tool_path()` PATH, `CLAUDECODE*` removed), used by the host and by `claude_models`.
  - `host.rs`: `pub fn serve(sock: &Path) -> std::io::Result<()>` (blocks until the host exits), `pub fn run()` (= `serve(&data_dir().join("host.sock"))`, logs errors to stderr).
  - `main.rs`: `if std::env::args().any(|a| a == "--host") { aimux_desktop_lib::host::run(); return; }` before `run()`.

Behaviour of `serve`:

- Bind: if the path exists and a connect succeeds, another host owns it → return `Ok(())`.
  Otherwise remove it, bind, `chmod 0o600`. Remove the socket file on exit.
- One thread per connection; state in `Arc<Mutex<…>>`: `chats`, `terms`, `unread: HashSet<String>`
  (chats stopped while flagged), `windows: usize`, `last_window_left: Instant`.
- `hello` → `{"protocol":1}`. `list` → `HostList` JSON, then clears every `unread` flag and the
  `unread` set (the app now holds them); stopped-unread chats appear with `alive: false`.
- `shutdown` → `{"ok":true}`, kill every child, remove the socket, `std::process::exit(0)`.
- `window` → no reply; `windows += 1` until the connection reads EOF, then `-= 1`.
- `chat_open`: if the chat is alive, write every buffered line, then
  `{"type":"aimux_live"}`, then subscribe the connection; with the lock held throughout so no
  line is lost or doubled. If absent and `start` is given, `spawn_claude(cwd, claude_args(…))`,
  record `history_len`, then same as alive. Absent and no `start`: write
  `{"type":"aimux_exit"}` and close. Child stdout lines (non-empty) and stderr (as
  `aimux_stderr`) go to the buffer, `ChatFlags::observe_out`, and every subscriber (a failed
  write drops that subscriber). On child exit: `{"type":"aimux_exit"}`, entry removed once
  that line has reached a subscriber (else kept until the next `chat_open`).
- `chat_send` → write the line to stdin, `observe_in`, push `sent_line(line)` to the buffer
  only (never to live subscribers: the window already echoed it). `chat_stop` → kill, remove.
- `term_open`: same replay/subscribe pattern; messages `{"d":"<text>"}`, then `{"live":true}`
  after the replay, `{"exit":<code|null>}` when the shell ends. An ended terminal stays listed
  (`ended: true`) until its `exit` message has been written to a subscriber once, then is
  removed. `term_write` / `term_resize` / `term_kill` as in today's `pty.rs`.
- Sweep thread, every 5 s, when `windows == 0`: after 300 s, kill chats with
  `!working && !waiting`, moving a set `unread` flag into the `unread` set; after 60 s, if
  `chats`, `terms` and `unread` are all empty, remove the socket and exit.
- `// ponytail: a chat's buffer keeps every line for the process's life; compact stream_event lines once onAssistant can rebuild multi-block messages from assistant lines alone.`

- [ ] **Step 1: Write the failing tests** (each runs `serve` on a temp socket in a thread; a
      helper `request(sock, json) -> serde_json::Value` writes one line and reads one)

```rust
#[test]
fn a_terminal_outlives_its_window_and_replays() {
    let sock = temp_sock();
    spawn_serve(&sock);
    let mut a = open(&sock, r#"{"op":"term_open","id":"t1","start":{"cwd":"/tmp","cols":80,"rows":24,"command":"echo aimux-host","workspaceId":"w","title":"T","tag":"setup"}}"#);
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
    let a = open(&sock, r#"{"op":"term_open","id":"t2","start":{"cwd":"/tmp","cols":80,"rows":24,"command":"sleep 0.3; echo done-late","workspaceId":"w","title":"T","tag":"setup"}}"#);
    drop(a);
    std::thread::sleep(std::time::Duration::from_millis(800));
    let list = request(&sock, r#"{"op":"list"}"#);
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
    assert_eq!(request(&sock, r#"{"op":"hello"}"#)["protocol"], HOST_PROTOCOL);
}

#[test]
fn a_second_host_leaves_a_live_socket_alone() {
    let sock = temp_sock();
    spawn_serve(&sock);
    assert!(serve(&sock).is_ok()); // returns at once
    assert_eq!(request(&sock, r#"{"op":"hello"}"#)["protocol"], HOST_PROTOCOL);
}
```

`temp_sock()` returns a fresh path under `std::env::temp_dir()` (short: macOS caps socket
paths at 104 bytes); `spawn_serve` starts `serve` in a thread and waits for the socket.

- [ ] **Step 2: Run, expect FAIL** — `cd src-tauri && cargo test host::` (no `serve`).
- [ ] **Step 3: Implement `serve`, `run`, `spawn_claude`, and the `--host` branch in `main.rs`**
      (`claude_models` now uses `spawn_claude`).
- [ ] **Step 4: Run, expect PASS** — `cd src-tauri && cargo test`
- [ ] **Step 5: Commit (ask first)** — `feat(host): background host serving chats and terminals`

---

### Task 3: App-side client and Tauri commands

**Files:**

- Create: `src-tauri/src/host_client.rs`
- Modify: `src-tauri/src/lib.rs` (handlers, `.manage(host_client::Presence::default())`),
  `src-tauri/src/chat.rs` (remove `ChatState`, `chat_start`, `chat_send`, `chat_stop`),
  `src-tauri/src/pty.rs` (remove `Terms` and the four `term_*` commands; keep `spawn`, `utf8_cut`)
- Test: `src-tauri/src/host_client.rs`

**Interfaces:**

- Consumes: Task 1 types, `host::serve` (tests only).
- Produces (Tauri commands; JS calls them with camelCase args):
  - `connect_or_spawn(sock: &Path, exe: &Path) -> Result<UnixStream, String>`: connect; on
    failure remove the stale file, spawn `exe --host` (constraints above), poll connect every
    50 ms up to 3 s.
  - `host_status() -> Result<HostStatus, String>` where
    `HostStatus { protocol_ok: bool, list: HostList }` (camelCase). Sends `hello`, then `list`;
    when `protocol_ok`, opens and keeps the `window` connection in `Presence` (once).
  - `host_restart() -> Result<(), String>`: `shutdown`, wait for the socket file to go
    (≤ 3 s), `connect_or_spawn`.
  - `chat_open(id: String, start: Option<ChatStart>, on_line: Channel<String>) -> Result<(), String>`:
    sends `chat_open`, a thread forwards each received line to `on_line` until EOF.
  - `chat_send(id: String, line: String)`, `chat_stop(id: String)`
  - `term_open(id: String, start: Option<TermStart>, on_data: Channel<String>, on_exit: Channel<Option<u32>>)`:
    forwards `d` to `on_data`, `exit` to `on_exit`; ignores `live`.
  - `term_write(id: String, data: String)`, `term_resize(id: String, cols: u16, rows: u16)`, `term_kill(id: String)`
  - All of these return the host's `error` text as `Err`.

- [ ] **Step 1: Write the failing tests**

```rust
#[test]
fn a_stale_socket_file_is_replaced() {
    let sock = temp_sock();
    std::fs::write(&sock, b"").unwrap(); // a file, nobody listening
    // No real exe in tests: `serve` in a thread stands in for the spawned host.
    let exe = PathBuf::from("/usr/bin/true");
    let s = sock.clone();
    std::thread::spawn(move || { std::thread::sleep(Duration::from_millis(100)); host::serve(&s).unwrap() });
    assert!(connect_or_spawn(&sock, &exe).is_ok());
}
```

- [ ] **Step 2: Run, expect FAIL** — `cd src-tauri && cargo test host_client::`
- [ ] **Step 3: Implement `host_client.rs`, swap the handlers in `lib.rs`, delete the moved commands.**
- [ ] **Step 4: Run, expect PASS** — `cd src-tauri && cargo test && cargo clippy -- -D warnings`
- [ ] **Step 5: Commit (ask first)** — `feat(host): app talks to the host`

---

### Task 4: Chat model reads replayed sends

**Files:**

- Modify: `src/chat/model.ts` (`reduceLine`)
- Test: `src/chat/model.test.ts`

**Interfaces:**

- Produces: `reduceLine` handles `{"type":"aimux_sent","message":<line>}`: a `user` message
  with prompt text → `addUserTurn(state, text, uuid-or-index)`; a `control_response` →
  `resolvePermission(state, message.response.request_id)`; anything else unchanged.
  `aimux_live` is a no-op for the reducer.

- [ ] **Step 1: Write the failing tests**

```ts
test('a replayed send shows the prompt', () => {
  const sent = JSON.stringify({
    message: JSON.parse(userLine('hi there', null)),
    type: 'aimux_sent',
  })
  const state = reduceLine(initialChat, sent)
  expect(state.turns.at(-1)?.role).toBe('user')
  expect(state.turns.at(-1)?.blocks[0]).toEqual({ kind: 'text', text: 'hi there' })
})

test('a replayed answer clears the permission', () => {
  const asked = JSON.stringify({
    request: { subtype: 'can_use_tool', tool_name: 'Bash', input: {} },
    request_id: 'r1',
    type: 'control_request',
  })
  let state = reduceLine(initialChat, asked)
  expect(state.pending).toHaveLength(1)
  const answer = permissionLine(state.pending[0], 'allow')
  state = reduceLine(state, JSON.stringify({ message: JSON.parse(answer), type: 'aimux_sent' }))
  expect(state.pending).toHaveLength(0)
})
```

- [ ] **Step 2: Run, expect FAIL** — `bun test src/chat`
- [ ] **Step 3: Implement the `aimux_sent` case** (reuse `promptText`).
- [ ] **Step 4: Run, expect PASS** — `bun test src/chat`
- [ ] **Step 5: Commit (ask first)** — `feat(chat): replay what the window sent`

---

### Task 5: The window reattaches

**Files:**

- Create: `src/app/use-host.ts`, `src/app/host-bar.tsx`, `src/app/use-host.test.ts`
- Modify: `src/app/use-chats.ts`, `src/app/use-terminals.ts`, `src/app.tsx`,
  `src/app/settings-view.tsx`

**Interfaces:**

- Consumes: Task 3 commands, Task 4 reducer.
- Produces:
  - `use-host.ts`: types `HostChat`, `HostTerm`, `HostList` (mirror Task 1, camelCase);
    `export function wouldLose(list: HostList): { chats: number; terms: number }` (chats
    `alive && (working || waiting)`, terms `!ended`);
    `export function hostDecision(status: { protocolOk: boolean; list: HostList }): 'attach' | 'restart' | 'blocked'`
    (`attach` if `protocolOk`; else `restart` if `wouldLose` is zero on both; else `blocked`);
    `export function useHost(): { state: { kind: 'loading' } | { kind: 'ready'; list: HostList } | { kind: 'blocked'; lose: { chats: number; terms: number } }; restart: () => Promise<void> }`
    (`restart` = `host_restart` then `location.reload()`; a `restart` decision calls
    `host_restart` then `host_status` again and lands on `ready`).
  - `use-chats.ts`:
    - procs map becomes `Map<string, Promise<void>>`, keyed by chat id;
    - `restore(records, host: HostChat[])`:
      - `unread` comes from `host.unread`;
      - each chat with `alive` is woken at once;
    - `wake`:
      - for a chat the host has alive, it slices the transcript to `historyLen` before `replayTranscript`, then calls `chat_open` with `start: null`;
      - otherwise it calls `chat_open` with `start: { cwd, resume, model, effort, historyLen: lines.length }`;
      - `initializeLine` is sent only when it started a new process;
    - `onAttention` and `unread` changes are suppressed for a chat until its `aimux_live` line;
    - new hook option `canStart: () => boolean`: `wake` rejects with `'The background process needs a restart.'` when it is false.
  - `use-terminals.ts`: `create(start)` passes `{ cwd, cols, rows, command, workspaceId, title, tag }`
    to `term_open`; new `reattach(t: HostTerm, onExit?: (code: number | null) => void): string`
    builds the same xterm tab with `t.id`, `t.title`, and calls `term_open` with `start: null`.
    `Start` gains `tag?: string`.
  - `app.tsx`: the restore effect waits for `useHost` to leave `loading`. When `ready`, it:
    - calls `chats.restore(records, list.chats)`;
    - reattaches every `list.terms` entry; for `tag === 'setup'`, `onExit` calls `setup_ran` as `runSetup` does;
    - passes `tag: 'setup'` from `runSetup`.

    When `blocked`, it renders `<HostBar lose={…} onRestart={restart} />` at the top of the main column, restores chats asleep with `canStart: () => false`, and creates no terminals.

  - `host-bar.tsx` copy: `The background process needs a restart: {n} chats working, {m} terminals will close.` with a `Restart` button (omit a zero clause).
  - `settings-view.tsx`: a `Restart background process` button, two clicks:
    - the first click turns the label into `Click again: closes {m} terminals` (or `Click again` when none);
    - the second click calls `restart`.

- [ ] **Step 1: Write the failing tests** (`use-host.test.ts`, pure functions)

```ts
const chat = (o: Partial<HostChat>): HostChat => ({
  alive: true,
  historyLen: 0,
  id: 'c',
  unread: false,
  waiting: false,
  working: false,
  ...o,
})
const term = (o: Partial<HostTerm>): HostTerm => ({
  code: null,
  command: null,
  cwd: '/',
  ended: false,
  id: 't',
  tag: null,
  title: 'T',
  workspaceId: 'w',
  ...o,
})

test('same protocol attaches', () => {
  expect(
    hostDecision({ list: { chats: [chat({ working: true })], terms: [] }, protocolOk: true })
  ).toBe('attach')
})
test('old host with nothing at stake restarts silently', () => {
  expect(
    hostDecision({ list: { chats: [chat({})], terms: [term({ ended: true })] }, protocolOk: false })
  ).toBe('restart')
})
test('old host with a working chat blocks', () => {
  expect(
    hostDecision({ list: { chats: [chat({ working: true })], terms: [] }, protocolOk: false })
  ).toBe('blocked')
})
test('old host with a live terminal blocks', () => {
  expect(wouldLose({ chats: [], terms: [term({})] })).toEqual({ chats: 0, terms: 1 })
})
```

- [ ] **Step 2: Run, expect FAIL** — `bun test src/app`
- [ ] **Step 3: Implement the interfaces above.**
- [ ] **Step 4: Run all checks, expect PASS**
      Run: `bun run lint && bun run format && bun test && (cd src-tauri && cargo test)` and `bun run web:build`
- [ ] **Step 5: Commit (ask first)** — `feat: chats and terminals survive closing the window`

---

### Task 6: Trial in the built app

**Files:** none (report only).

- [ ] **Step 1: Build** — `bun run build`
- [ ] **Step 2: Hand the owner the trial** (do not leave processes running yourself):
      `open --env AIMUX_PROFILE=gui-dev src-tauri/target/release/bundle/macos/aimux.app`, then:
  1. start a long Claude turn and a terminal running `sleep 999; echo back`; ⌘Q; wait 30 s;
     reopen → the turn is still streaming (or done, with the unread dot), terminal still there;
  2. answer a permission, ⌘Q, reopen → the permission is not asked again;
  3. `ps aux | grep -- '--host'` shows one host; quit with nothing open, wait 70 s → it is gone;
  4. kill the host → reopen: chats resume from transcripts, terminals gone.
- [ ] **Step 3: Report** what was run, what passed, and what could not be checked.
