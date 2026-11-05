# Background host: work that outlives the window

## Why

Today every `claude` and every shell is a child of the app (`src-tauri/src/chat.rs`,
`src-tauri/src/pty.rs`). Quit the app, or restart it for an update, and a turn in progress is
cut, terminals die. The owner wants aimux's model: work runs in a background process, the
window is only a view on it. This is also the ground the next project stands on (auto-update
that restarts only the window, and separate dev/prod apps).

## What the user gets

- ⌘Q closes the window. Claudes keep working, terminals keep running (a dev server stays up).
- Reopening the app shows every chat and terminal exactly as if the window had never closed:
  live, with everything printed meanwhile, no gap and no duplicate. A permission Claude asked
  for while closed is waiting in its chat.
- An app update restarts the window only. The host keeps running unless its protocol changed.
- After a reboot, or a host restart: chats come back from their transcript and resume (as
  today); terminals are gone.

## Goals

- Move process ownership (Claude chats, terminals) out of the app into a host process.
- Reattach on launch: same tabs, live, full output since each process started.
- A clean version rule so an app update rarely restarts the host.

## Non-goals

- Notifications while the window is closed (owner's call). On reopen, the unread / waiting
  markers show what needs attention.
- Surviving a reboot or a logout. No launchd agent.
- Hot-swapping the host without killing its processes (aimux's terminal-manager / reexec split).
  Not worth it while the host stays small.
- Moving anything else into the host: git, store, quotas, `claude_models`, `chat_history` stay
  in the app.
- Auto-update and dev/prod separation: next project.

## Anti-goals

- A TCP port, a web server, a WebSocket. Unix socket only, mode 0600, in the profile's data dir.
- A second binary to ship or sign. The host is the app's own executable run as `aimux --host`.
- A host that never stops: it exits on its own when nothing runs and no window is connected.
- Replay that re-fires attention (unread dot, sound, notification) for things already seen.

## How (decided)

- **One binary, two modes.** `main.rs` checks for `--host` before Tauri starts; in that mode
  it runs the host loop and never touches Tauri or AppKit (no Dock icon).
- **Spawned by the app, detached.** On launch the app connects to `<data_dir>/host.sock`
  (`store::data_dir()`, so `AIMUX_PROFILE` / `AIMUX_DESKTOP_HOME` isolate it). No answer: it
  removes a stale socket, spawns `current_exe() --host` in its own session (`setsid`),
  stdin/stdout to null, stderr to `<data_dir>/host.log`, and waits for the socket.
  Two windows racing to spawn: the loser fails to bind and exits; the app just reconnects.
- **Transport.** `std::os::unix::net`, newline-delimited JSON both ways. No new crate.
- **Host owns, keyed by the app's ids.** Chats by `ChatRecord.id`, terminals by tab id
  (UUIDs the app already makes). The host remembers per process what it needs to list it
  again: kind, id, cwd, and for terminals workspaceId, title, command; for chats the args it
  was started with.
- **Output buffer.** Per process, everything it printed since spawn, so a reattaching window
  gets the full picture. Terminals: a capped ring of raw output (≈ the 10 000-line xterm
  scrollback). Chats: the stream-json lines; partial-message deltas may be dropped once their
  message is complete, to bound memory.
- **Several windows at once** (unlikely but free): every attached connection gets the stream.
- **The app side.** `chat.rs` and `pty.rs` keep their spawn code but it runs in the host. The
  Tauri commands (`chat_start`, `chat_send`, `chat_stop`, `term_start`, `term_write`,
  `term_resize`, `term_kill`) become thin forwards to the host, keeping their Channel-based
  shape so `use-chats.ts` / `use-terminals.ts` change as little as possible. A new
  `host_list` command returns what is running, for reattach at launch.
- **Reattach at launch.** Chats whose id the host knows are attached instead of started;
  terminals the host lists are recreated as tabs (they are not persisted by the app today).
  Replayed lines must not trigger `onAttention`; only what arrives after the replay does.
- **Closing a tab** kills its process in the host, as today. **Quitting the window** kills
  nothing that is working.
- **Idle chats are stopped while no window is connected** (my call). A chat is idle when its
  last turn ended (`result` line) and no permission is pending; the host reads that much of
  the stream. Five minutes after the last window disconnects, idle chats are stopped; on
  reopen they come back asleep and wake with `--resume` when opened, as today. Working chats
  and terminals keep running.
- **Idle exit.** The host exits when it has no process and no connection for 60 s.
- **Processes that end while no window is connected** (my call). The host keeps the ended
  entry (exit code, output) until a window has attached and seen it. On reattach:
  - a setup-script terminal reports its exit through the same `onExit` path, so `setup_ran`
    is recorded;
  - a command terminal comes back as a tab showing `[exited with code N]`, as today;
  - a plain shell that exited does not come back (today its tab closes with it).
- **Unread after reopen** (my call). The host flags a chat whose turn ended, or which asked
  for permission, while no window was connected; `host_list` returns the flag and the app
  sets `unread` / waiting from it. Replayed lines never fire `onAttention`.
- **Versions.** `HOST_PROTOCOL: u32`, bumped by hand whenever the host's messages or
  behaviour change incompatibly. First message on connect is `hello { protocol }`.
  - Same protocol: attach, whatever the app version.
  - Different, and nothing would be lost (no chat working or waiting, no terminal): restart
    the host silently (my call).
  - Different, and something would be lost: the app shows an inline bar ("The background
    process needs a restart: 2 chats working, 1 terminal will close." [Restart]). Until the
    user clicks, chats and terminals are read-only and nothing is started: a second Claude on
    the same session would corrupt its transcript. Restart = host kills its children and
    exits, app spawns the new one, chats resume from transcripts.
  - Rule: `hello`, `list` and `shutdown` keep the same shape across every protocol version,
    so any app can always talk that much to any host.
  - A "Restart background" entry in Settings for the same action at any time (to pick up a
    host fix that did not bump the protocol).
- **Docs.** CLAUDE.md already updated (product decisions, the Unix socket rule).

## Left to the builder

- Exact message names and shapes; how chat replay avoids duplicating transcript lines when the
  chat was started with `--resume` (e.g. host records where the transcript ended at spawn, or
  the app skips transcript entries the replay covers).
- Threading model in the host (threads like today are fine).
- Buffer caps.
- Where the restart bar sits, following the app's existing inline patterns.

## Checks

- One Rust test: start the host on a temp `AIMUX_DESKTOP_HOME`, start a terminal running
  `echo`, disconnect, reconnect, `list` shows it and replay contains the output.
- Manual, with `AIMUX_PROFILE=gui-dev`: start a long Claude turn and a `sleep 999` terminal,
  ⌘Q, wait, reopen: both live, output complete. Kill the host: chats resume, terminals gone.
