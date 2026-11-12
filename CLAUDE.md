# aimux desktop

## The goal

The most pleasant app for working with Claude on several things at once. Each piece of work
gets its own git worktree, with its chats and terminals beside it. The bar is "the perfect
app": every rough edge counts, and UX beats feature count.

Conductor.build is the reference for layout, density and feel. Copy how it works, never its
branding.

## Product decisions (made by the owner; don't reopen them without asking)

- **Standalone.** No dependency on aimux's daemon, no `aimux` CLI, nothing imported from the
  aimux repo. The aimux TUI is a separate product and stays as it is. On first launch, the
  app imports aimux's project list once, read-only.
- **Work runs in the background.** Our own host process (the app's binary in `--host` mode,
  modelled on aimux's daemon, not shared with it) owns every Claude and every terminal.
  Quitting the window leaves them running; reopening shows them live, including what
  happened meanwhile. An app update restarts only the window; the host restarts only when
  its own protocol changed. One host per profile.
- **Two kinds of tab only: Chat and Terminal.** A chat is native Claude: the real `claude`
  binary run headless over stream-json, drawn by our own UI, so everything Claude Code can
  do keeps working. No Codex, no other assistants, no Claude Code TUI inside a terminal tab.
- **Everything is a worktree.** The main checkout is the project, never a workspace. No "root".
- **Workspaces are named from their first prompt**, as the aimux TUI does: each is made on a
  colour from a fixed pool (folder and `aimux/amber` branch), then one quick headless Claude
  call (haiku, `naming.rs`) gives it a title and a `<type>/<subject>` branch. The folder keeps
  the colour, which stays the colour word in the sidebar. Any failure keeps the colour. The
  user can rename a workspace in place (the name only). The composer does not show the
  branch name.
- **One composer for new work** (⌘N): project, prompt, base branch, model. The base branch
  is preselected (the repo's default), with recent picks and search. Enter creates.
- **Models come from Claude Code itself** (its `initialize` answer), never a hardcoded list.
  Effort is an "Intelligence" slider. ⇧⌘/ steps through it.
- **Git does what the aimux TUI does, no more:**
  - stage, unstage, discard (asks twice), push/publish;
  - the PR at the top right of the git panel, with its status and one action: merge, then
    delete the workspace once merged.
  - No commit message box: nobody commits by hand anymore. No "create PR": without a PR,
    "Ask for PR" sends the workspace's chat a prompt and Claude opens it with gh.
- **Sidebar rows** lead with the workspace's task (its first chat's title, or the name the
  user gave it) behind the agent's state (working loader, waiting, done; nothing when idle),
  the colour word and age at the right. A row that finishes or waits flashes once in green or
  amber and keeps a faint wash from its left edge, as in the aimux TUI. No colour bars.
- **The working loader** is braille drawn as ink dots (only the lit ones), the same one
  everywhere something works; Settings › Appearance picks it among the square loaders.
- **Artifacts** Claude publishes (Claude Code's own `Artifact` tool, always on) open
  in the right panel's browser, logged in to claude.ai once: one Artifacts tab, the title
  opening a searchable list of them in the page's place. They never take the keyboard.
- **No modal for anything quick.** Use inline confirmation, right-click menus, in-place
  rename. The composer is the one dialog.
- **Closing the window loses nothing**: chats and terminals keep running in the host.
  After a reboot or a host restart, chats come back (reloaded from Claude Code's transcript
  and resumed); terminals don't.
- **Quotas** come from Claude's OAuth usage endpoint (poll every 180 s at most, or it
  throttles). A chat's cost is Claude Code's API-price estimate, not what the subscription
  bills.
- **Client label.** Every `claude` we launch sets `CLAUDE_CODE_ENTRYPOINT=aimux-desktop`
  (`chat.rs`), naming the app instead of the headless default `sdk-cli`, which drains the 5h
  window about twice as fast for the same tokens (anthropics/claude-code#97074). Never
  pretend to be another client (`cli`, `claude-vscode`).
- **It feels native**:
  - keyboard first: ⌘N, ⌘T chat, ⇧⌘T terminal, ⌘W (twice if the agent is working), ⌘P,
    ⌘1–9 workspaces (sidebar order), ⌃1–9 tabs, ⌃Tab / ⌃⇧Tab tabs, ⌥⌘↑/↓ workspaces,
    ⌘S (⌘B too) the sidebar, which slides out over the content from the left edge while hidden,
    ⌥⌘B, ⌘G, ⌘, settings;
  - no browser context menu;
  - a macOS menu that leaves ⌘W to the app.
- **Updates**: the installed app checks GitHub releases at launch, when the window comes
  back to the front (at most every ten minutes) and every hour, and from Settings › About; a
  newer one shows an "Update to x.y.z" pill in the top bar. One click installs and restarts
  the window only. Updates are signed; a dev build never updates.
- **Dev and prod are two apps**: the installed "aimux" is prod; `bun run dev` is "aimux Dev",
  with its own identifier, data folder (profile `dev`) and host. The owner works on this
  repo from prod.
- **Open source**: public at `nbardavid/aimux-desktop`, MIT, crediting BrimVeyn/aimux where
  it started (its `desktop/` history is kept).
- **The look**: light, flat, white surfaces, system font, warm neutrals. Never a hatched or
  decorative background. Dark mode is not done yet.
- **Craft is the product.** Everything clean, square and aligned; every state change smooth,
  with short transitions. `DESIGN.md` holds the bar, the motion table and the states every
  surface needs; read it before any UI work and follow it.

## Hard rules

- No TCP listener of any kind (no web server, no WebSocket). The webview talks to Rust over
  Tauri IPC only; the app talks to its host over a Unix socket in the profile's data folder,
  readable by the user alone.
- UI buttons call explicit host commands that do the real thing; never simulate keystrokes.
- English everywhere: UI, code, commits, docs. The owner chats in French and dictates by
  voice (expect odd words; "n8n" or "Emacs" have meant aimux).
- bun only, never npm.
- Try things in a dev build or with `AIMUX_PROFILE=gui-dev`: both get their own data folder
  and host, so the owner's real projects and running work stay untouched.
- Commit only when asked, one approval per commit. Pushing needs its own approval. No
  Co-Authored-By line.
- Before calling something done, run the tests, the lint and the formatter, and say plainly
  what you could not check in the running app.

## Checks and trial runs

- Checks: `bun run lint && bun run format && bun test && (cd src-tauri && cargo test)`.
- Build (signs the update archive): `TAURI_SIGNING_PRIVATE_KEY=~/.tauri/aimux-desktop.key bun run build`.
  Launch for a trial:
  `open --env AIMUX_PROFILE=gui-dev src-tauri/target/release/bundle/macos/aimux.app`.
- Release: `bun bump patch|minor|major` (semver; builds and signs locally, then commits, tags,
  pushes and publishes the GitHub release with `gh`; no CI).
  Needs the owner's go-ahead like any push.
- **UI is tested in the browser.** `bun run web:dev` (http://localhost:1420) serves the app
  with Tauri IPC mocked by fixture data (`src/dev/`, dev only, never in a build). Check every
  UI change there with the chrome-devtools tools: reach the screen, screenshot it, drive it by
  keyboard and mouse, read the console. Keep the fixtures covering new screens and states.
  Start the server for the check and stop it after.
- The real app (`bun run dev`) is only for what the mock cannot show: the background host,
  real Claude processes, terminals, git on disk, the updater. The owner runs it; hand them
  the command and don't leave long-running processes in the background.
