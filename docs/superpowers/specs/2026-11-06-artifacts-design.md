# Artifacts and the in-app browser

## Why

When Claude explains something, a visual (a diagram, a comparison, a flow, a mockup) says it
better than prose. Claude Code can publish those as **artifacts**: its own `Artifact` tool
turns a local HTML page into a claude.ai page, private to the account, with versions,
comments and sharing. The owner wants them in the app, beside the chat that made them,
opening by themselves. "It's a browser": the right panel becomes a real browser, like
Conductor's in-app browser (0.62), which later also opens a dev server.

## Facts this rests on (checked 2026-11-06, Claude Code 2.1.319, Tauri 2.12.5)

- The `Artifact` tool (with `ArtifactComments`, `ArtifactData`) only exists when `claude`
  runs with `CLAUDE_CODE_ARTIFACT=1`; the `system/init` line's `tools` then lists it. It is a
  beta for Team and Enterprise orgs; a test publish from the owner's account worked.
- A publish: Claude writes the page to its session scratchpad
  (`/private/tmp/claude-<uid>/…/scratchpad/<name>.html`), then calls `Artifact` with
  `file_path` (no `action`, or `action: "publish"`), optional `title`, `description`, `icon`,
  `url` (to update an existing one). The tool result's text reads
  `Published <path> at https://claude.ai/artifact/<id> (Version N, …)`. Links can also be
  `https://claude.ai/code/artifact/<uuid>`. A first call is usually `action: "quickstart"`
  (no URL in its result). `action: "open"` with a `url` exists too.
- claude.ai can't be framed (`X-Frame-Options: SAMEORIGIN`) and sits behind a Cloudflare
  challenge, so an iframe is out. It needs a real browser with the user's claude.ai login.
- Tauri 2.12.5 with the `unstable` feature has child webviews: `Window::add_child`,
  `Webview::set_bounds / hide / show / navigate / reload / set_focus`, and, on the builder,
  `user_agent`, `on_new_window`, `on_navigation`, `on_document_title_changed`,
  `data_store_identifier`. Conductor ships the same (its binary has the multi-webview code).
- Google refuses its sign-in in embedded webviews by their user agent. The owner signs in to
  claude.ai with Google.

## What the user gets

- When Claude publishes an artifact, the right panel opens (if shut) on a browser tab showing
  it, logged in to claude.ai. The keyboard stays in the composer: the artifact comes to the
  front, the cursor does not move.
- The panel's tab row, today `Changes · Checks`, gains one tab per browser page of the
  workspace: an icon and the page title. Click to switch; Changes and Checks are still there.
- A workspace's artifacts stay listed across launches until removed. Right-click a tab ›
  Close removes it from the workspace (the artifact itself stays on claude.ai). An artifact
  republished (same URL) brings its tab to the front and reloads it.
- An artifact published in a workspace you are not looking at does not pull you there: its
  tab is waiting when you go, marked new until opened.
- The first time, the page asks you to sign in to claude.ai inside the panel. You do it once
  (Google included); the browser keeps the session.
- A small bar above the page: back, reload, the page's address (read-only), "Open in browser"
  (the default browser).
- An artifact whose chat runs with the window closed is listed when the window comes back
  (found in the chat's history), without stealing the front.

## Non-goals (v1)

- Typing a URL, opening a dev server, bookmarks. (The browser is built so these come next.)
- App shortcuts while the keyboard is inside the browser page (see "Focus" below).
- Deleting an artifact on claude.ai from the app; editing; comments UI of our own.
- Any other assistant's artifacts; artifacts from terminal tabs.

## Anti-goals

- The browser page must never reach the app: every IPC call from it is refused, and no
  capability names it or its origin. It is the open web (claude.ai pages written by others
  included). Tauri injects its bridge object into every webview it makes, so the object is
  there; what keeps the page out is Tauri's own refusal of commands from a remote origin no
  capability lists (`webview/mod.rs`), the same model Tauri uses for any remote content.
  _(Builder check; my call: refusal is the boundary, as in Conductor.)_ As a second fence,
  `capabilities/default.json` moves from `windows: ["main"]` to `webviews: ["main"]`, so a
  child webview of the main window never matches it.
- No TCP listener (CLAUDE.md hard rule). Outbound HTTPS from the browser is fine.
- A menu, tooltip, ⌘P, the ⌘N dialog or a toast must never be hidden under the browser.
- The chat must never lose the keyboard because an artifact appeared.

## How it works

### Turning artifacts on

`spawn_claude` (`src-tauri/src/chat.rs`) sets `CLAUDE_CODE_ARTIFACT=1` and
`CLAUDE_CODE_ARTIFACT_AUTO_OPEN=0` (after its loop that strips inherited `CLAUDE_CODE_*`
variables). Without the second one Claude Code opens each new artifact in the default
browser itself (`?via=auto_preview`): every publish would show twice, and a chat running with
the window closed would pop Safari. _(Builder check.)_

Both are behind a setting, **Settings › Chats › Artifacts** (`chat.artifacts`, a toggle, on
by default; help: "Claude can publish visual explanations to your claude.ai account; they
open beside the chat. Needs a Team or Enterprise plan."). The host reads `settings.json` when
it spawns a chat (it is the same binary, `store.rs` `read_settings_map`), so a change applies
to the next chat started. _(My call: the app is open source, the tool is a Team/Enterprise
beta, and it publishes to claude.ai on its own; the owner keeps it on.)_ This runs in the host. **No `HOST_PROTOCOL`
bump** (a bump restarts the host on update and closes terminals): chats started by an older
host simply have no `Artifact` tool until the host restarts (Settings › Restart, or the next
protocol bump). The webview needs no flag: it reacts to what the stream shows.

### Noticing a publish

- A pure helper in `src/chat/model.ts`, next to `changedFiles`: from a chat's blocks, every
  `Artifact` tool block whose `action` is absent, `publish` or `open`, with a result that is
  not an error and contains a claude.ai artifact URL
  (`https://claude.ai/(code/)?artifact/[A-Za-z0-9-]+`), gives `{ url, title?, toolId }`.
  `title` is the input's `title` when given; otherwise the tab shows the page's own title
  once loaded (`on_document_title_changed`).
- Live (`use-chats.ts` `onLine`, not `replaying`): a new such block raises a new hook,
  `onArtifact(chat, artifact)`, beside `onAttention`. The app adds it to the workspace and,
  if the workspace is on screen, opens it in front.
- Replay and history: when a chat's state is built from history, its artifacts are added to
  the workspace's list too (idempotent by URL), never brought to the front. That is how
  artifacts made while the window was closed show up.

### Where the list lives

The catalog (`store.rs`, `catalog.json`) gains, per workspace, `artifacts: [{ url, title,
chatId, at, seenAt?, closed? }]`, with commands `artifact_add(workspaceId, url, title, chatId,
live)`, `artifact_close(workspaceId, url)`, `artifact_seen(workspaceId, url)`.
`artifact_add` is idempotent by URL: a known one only updates its title; a `live` add (a new
publish) also updates `at` and clears `closed`, while a history add never reopens a closed
tab. `artifact_close` sets `closed` rather than forgetting the URL, so replays don't bring it
back. Removing the workspace drops them with it. A tab is
"new" while `seenAt` is missing or older than `at`. The preview mock implements the same.

### The browser (Rust, `src-tauri/src/browser.rs`)

- `tauri` gains the `unstable` feature.
- One child webview per open browser tab, labelled `browser-<n>`, added to the main window
  with `add_child`, created lazily on first show, hidden when its tab is not the panel's
  view. Keep at most ~6 alive (least recently shown beyond that are closed and re-created on
  demand); the builder may tune that.
- Builder settings: a Safari user agent (the WebKit version the system has, ending in
  `Version/<x> Safari/<y>`), so Google's sign-in accepts it; `on_new_window` loads the
  requested URL in a temporary popup webview window (sign-in popups need `window.opener`) or,
  if the builder finds claude.ai's Google flow redirects instead, in the same webview;
  `on_navigation` allows http(s) only; `on_document_title_changed` sends the title to the
  main webview (an event the app listens to). The default persistent website data store, so
  the login survives relaunches. No capability lists these labels: they get no IPC.
- Commands for the main webview: `browser_show(id, url, bounds)`, `browser_hide(id)`,
  `browser_hide_all()`, `browser_bounds(id, bounds)`, `browser_back(id)`,
  `browser_reload(id)`, `browser_close(id)`, `browser_focus(id)`. Bounds are logical pixels
  relative to the window's content.
- Must be checked in the real app: an `invoke` from the child page (e.g. from Web Inspector)
  is refused.

### The panel (webview)

- `GitPanel`'s view goes from `'changes' | 'checks'` to also `{ browser: url }`. The PR band
  stays on top whatever the view.
- The tab row keeps `Changes` and `Checks` first, then the workspace's browser tabs, newest
  first, in the same `Tab` look: a 14px globe/file icon and the title truncated at ~160px
  (full title and URL in the tooltip). The row scrolls sideways when full, no visible
  scrollbar. New tabs enter per the motion table (160ms, neighbours make room). Unopened ones
  carry the `done` dot. Right-click › Close (the app's `context-menu.tsx`). Closing the one on
  screen falls back to the next browser tab, else Changes.
- Below the tab row when a browser tab is the view: the address bar (h-bar 40, chrome
  background): back, reload, the URL in `text-xs text-faint` truncated, "Open in browser"
  (opener plugin). Below it, a placeholder `div` that the native webview covers exactly.
- **Bounds**: a `ResizeObserver` on the placeholder plus window resize sends `browser_bounds`
  (rAF-throttled). While the panel slides (the `Slide` 200ms width animation, ⌥⌘B, the
  splitter drag), the native view is hidden and shown again at its final bounds, with the
  placeholder showing a still frame (the chrome colour) so nothing flashes.
- **Overlays**: whenever anything that floats over the app is open (menus, context menus,
  popovers, tooltips that would cross the panel, ⌘P, the ⌘N dialog, toasts, the attention
  banner), the browser is hidden (`browser_hide_all`) and shown again when the last one
  closes. One counter in the app, fed by those components (or by watching Base UI's portal
  container); the builder picks the mechanism, the rule is "never under the browser".
- Width: a page needs more room than a file list. While a browser tab is the view, the
  panel uses `browserWidth` from `use-layout.ts` (persisted like `gitWidth`), default about
  45% of the window, limits keeping the chat at least ~420px. Switching between a list view
  and a browser tab slides the width (200ms ease-in-out).
- Leaving the workspace, opening Settings or ⌘G git mode, or shutting the panel hides the
  browser; coming back shows the same page where it was (it was only hidden).
- States: loading (the placeholder shows a quiet spinner until the first load ends), a page
  that fails to load (the webview shows WebKit's error; the address bar's reload retries),
  signed out (claude.ai's own sign-in page: nothing of ours).

### Focus

- Auto-open never calls `browser_focus`; the composer keeps the keyboard.
- Clicking the page gives it the keyboard (a native view takes it). App shortcuts typed then
  go to the page, not the app: accepted for v1. Clicking anywhere in the app takes the
  keyboard back. Escape hatch for later: a key-forwarding bridge, out of scope here.

### Preview (browser mock)

The browser preview has no native webviews. In `src/dev/`, the placeholder shows a
fixture image or a plain card with the page title and URL instead, so the tab row, the
address bar, the width switch, the "new" dots and Close can be checked. A fixture chat
publishes an artifact (a `quickstart` call, a Write to a scratchpad path, an `Artifact`
publish with its result text), and `?artifacts` starts with two artifacts on a workspace,
one unread.

## Left to the builder

- The exact Safari user-agent string and how it tracks the system's WebKit.
- Popup handling for Google sign-in (popup window vs same webview), proven in the real app.
- The overlay-tracking mechanism; the live-webview cap; icons; exact widths.
- Whether the title is also read from the scratchpad file's `<title>` before the page loads.

## Checks before calling it done

Lint, format, `bun test`, `cargo test`; the preview at 1000×600 and 1440×900 in every panel
state. In the real app (`bun run dev`, the owner runs it): signing in to claude.ai with
Google inside the panel works and survives a relaunch; asking a chat to explain something
visually publishes an artifact that opens beside it without moving the cursor; menus, ⌘P,
⌘N and toasts are never under the page; resizing and ⌥⌘B keep the page exactly in place;
an `invoke` from the page is refused; artifacts from a chat that ran with the window closed
are listed on return; Close removes a tab and it stays closed after relaunch. CLAUDE.md gains
one product line ("Artifacts open in the right panel's browser…").
