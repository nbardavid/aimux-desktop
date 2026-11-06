# Artifacts and the in-app browser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claude's published artifacts open by themselves in a real browser in the right panel, one tab each, logged in to claude.ai.

**Architecture:** The host turns Claude Code's `Artifact` tool on (env flags, behind a setting). The webview spots publishes in the chat stream (live and in history), records them per workspace in the catalog, and shows them as tabs of the git panel. Each tab is a native Tauri child webview (Tauri `unstable`) laid exactly over a placeholder in the panel, hidden whenever anything floats over it.

**Tech Stack:** Tauri 2.12.5 (`unstable` feature), Rust, React 19, Tailwind 4, bun test, cargo test.

**Spec:** `docs/superpowers/specs/2026-11-06-artifacts-design.md`

## Global Constraints

- Branch `aimux/fuchsia-artifacts`; commit per task only once the owner approves commits (CLAUDE.md: one approval per commit, no Co-Authored-By line).
- Checks after every task: `bun run lint && bun run format && bun test && (cd src-tauri && cargo test)`.
- No TCP listener; the browser webviews get no capability; `capabilities/default.json` targets `webviews: ["main"]`.
- No `HOST_PROTOCOL` bump.
- `CLAUDE_CODE_ARTIFACT=1` and `CLAUDE_CODE_ARTIFACT_AUTO_OPEN=0`, only when setting `chat.artifacts` (default `true`) is on.
- Artifact URL pattern: `https://claude.ai/(code/)?artifact/[A-Za-z0-9-]+`.
- Motion and tokens per DESIGN.md (tabs 160ms ease-out; panel width 200ms ease-in-out; `h-bar` 40; `text-xs text-faint` for the address).
- English everywhere; bun only.

## Review Focus

- An `Artifact` call whose result has no URL (`quickstart`, `list`, an error) must not make a tab (Task 3 test `ignores calls without a published URL`).
- The same URL published again must stay one tab, brought to the front, title updated (Task 2 test `live add of a known url…`; Task 3 test `republish yields the same url once`).
- A closed tab must stay closed when the chat's history is replayed, and reopen on a new live publish (Task 2 tests).
- Leaving the workspace, opening Settings, ⌘G, shutting the panel, an open menu, or the panel sliding must hide the native view (Task 6 test table for `browserShown`).
- Deleting or cleaning up a workspace must take its artifacts and close its webviews (Task 2 test via `workspace_remove` path; Task 6 `closeWorkspace` call in app wiring).

---

### Task 1: Turn the tool on, behind a setting

**Files:**
- Modify: `src-tauri/src/chat.rs` (`spawn_claude`), `src-tauri/src/store.rs` (make `read_settings_map` `pub(crate)`)
- Modify: `src/settings/schema.ts` (new section `chat`, label `Chats`, before `git`)
- Modify: `src-tauri/capabilities/default.json` (`"windows": ["main"]` → `"webviews": ["main"]`)
- Test: `src-tauri/src/chat.rs` tests module; `src/settings/schema.test.ts`

**Interfaces:**
- Produces: `pub fn artifact_env(settings: &serde_json::Map<String, Value>) -> Vec<(&'static str, &'static str)>` in `chat.rs`; setting id `chat.artifacts`.

- [ ] **Step 1: Failing tests.** Rust: `artifact_env_on_by_default` (empty map → `[("CLAUDE_CODE_ARTIFACT","1"),("CLAUDE_CODE_ARTIFACT_AUTO_OPEN","0")]`), `artifact_env_off_when_disabled` (`{"chat.artifacts": false}` → empty), `artifact_env_ignores_non_bool` (`"no"` → on). TS: `rowById('chat.artifacts')` is a toggle with fallback `true`.
- [ ] **Step 2:** Run `cd src-tauri && cargo test artifact_env` and `bun test src/settings` → FAIL.
- [ ] **Step 3: Implement.** `spawn_claude` applies `artifact_env(&store::read_settings_map())` after the `CLAUDE_CODE_*` strip loop. Schema row: `{ kind: 'toggle', id: 'chat.artifacts', label: 'Artifacts', fallback: true, help: 'Claude can publish visual explanations to your claude.ai account; they open beside the chat. Needs a Team or Enterprise plan.' }`. Capability edit as above.
- [ ] **Step 4:** Tests pass; full checks.
- [ ] **Step 5: Commit** `feat(chat): Turn on Claude Code's Artifact tool, behind Settings › Chats › Artifacts`.

### Task 2: Artifacts in the catalog

**Files:**
- Modify: `src-tauri/src/store.rs` (struct, field, pure fns, commands), `src-tauri/src/lib.rs` (register commands)
- Modify: `src/model/catalog.ts` (types), `src/app/use-catalog.ts` (methods), `src/dev/mock-ipc.ts` (same commands)
- Test: `src-tauri/src/store.rs` tests module

**Interfaces:**
- Produces (Rust): `pub struct Artifact { url: String, title: String, chat_id: String, at: u64, seen_at: Option<u64>, closed: bool }` (camelCase serde, `#[serde(default)]` on optional/bool fields); `Workspace.artifacts: Vec<Artifact>` with `#[serde(default)]`; pure `fn add_artifact(c: &mut Catalog, workspace_id: &str, url: &str, title: &str, chat_id: &str, live: bool, now: u64) -> Result<(), String>`, `fn close_artifact(c, workspace_id, url)`, `fn see_artifact(c, workspace_id, url, now)`; commands `artifact_add(workspace_id, url, title, chat_id, live)`, `artifact_close(workspace_id, url)`, `artifact_seen(workspace_id, url)`.
- Produces (TS): `interface Artifact { url: string; title: string; chatId: string; at: number; seenAt?: number | null; closed?: boolean }`; `Workspace.artifacts?: Artifact[]`; `useCatalog()` gains `addArtifact(workspaceId, url, title, chatId, live): Promise<void>`, `closeArtifact(workspaceId, url)`, `seeArtifact(workspaceId, url)` (each invokes then `reload()`); `export const isNew = (a: Artifact) => a.seenAt == null || a.seenAt < a.at` in `catalog.ts`.

- [ ] **Step 1: Failing tests** (Rust): `add_is_idempotent_by_url` (two adds, one entry); `live_add_of_a_known_url_updates_at_title_and_reopens` (close, then live add → `closed == false`, new `at`, new title); `history_add_never_reopens` (close, then `live=false` add → still closed, `at` unchanged); `empty_title_keeps_the_old_one`; `seen_marks_not_new` (`seen_at >= at`); `unknown_workspace_is_an_error`; `artifacts_default_to_empty_in_old_catalogs` (deserialize a workspace without the field). TS: `isNew` cases.
- [ ] **Step 2:** `cd src-tauri && cargo test artifact` → FAIL.
- [ ] **Step 3: Implement** with the existing `edit(&store, …)` pattern. Removing a workspace already drops the struct, so its artifacts go with it.
- [ ] **Step 4:** Tests pass; full checks.
- [ ] **Step 5: Commit** `feat(store): Keep each workspace's artifacts in the catalog`.

### Task 3: Spotting a publish

**Files:**
- Modify: `src/chat/model.ts` (helpers next to `changedFiles`), `src/app/use-chats.ts` (hook)
- Test: `src/chat/model.test.ts`, `src/app/use-chats.test.ts`

**Interfaces:**
- Produces: `export interface Published { url: string; title: string; toolId: string }`; `export function artifactUrl(text: string): string | null`; `export function publishedArtifacts(blocks: Block[]): Published[]` (in block order, deduped by URL keeping the last title); `UseChatsOptions.onArtifact: (chat: ChatTab, artifact: Published, live: boolean) => void`.

- [ ] **Step 1: Failing tests.** `artifactUrl` finds both URL shapes inside `Published /tmp/x.html at https://claude.ai/artifact/Q7qKRZLjujn7avFRs7C3Bv (Version 1, …)` and returns null for plain text. `publishedArtifacts`: a publish block (no `action`, `file_path`, `title: 'Flow'`, result with URL) → `[{ url, title: 'Flow', toolId }]`; `ignores calls without a published URL` (`quickstart`, an `isError` result, a result-less block, `action: 'list'`); `action: 'open'` with a URL result counts; `republish yields the same url once`; no `title` → `''`. In `use-chats.test.ts`: a live line completing a publish calls `onArtifact(…, live=true)` once; replayed lines and `wake`'s history call it with `live=false`.
- [ ] **Step 2:** `bun test src/chat src/app/use-chats.test.ts` → FAIL.
- [ ] **Step 3: Implement.** In `onLine`, compare `publishedArtifacts` before/after `reduceLine` and raise new ones with `live = !replaying`; after `wake` builds state from history, raise all of them with `live=false`. Fire via `queueMicrotask` like `onAttention`.
- [ ] **Step 4:** Tests pass; full checks.
- [ ] **Step 5: Commit** `feat(chat): Notice artifacts Claude publishes`.

### Task 4: The browser in Rust

**Files:**
- Create: `src-tauri/src/browser.rs`
- Modify: `src-tauri/Cargo.toml` (`tauri` features `["unstable"]`), `src-tauri/src/lib.rs` (module, `.manage(browser::Browsers::default())`, commands)
- Test: `src-tauri/src/browser.rs` tests module

**Interfaces:**
- Produces: `#[derive(Deserialize)] pub struct Bounds { x: f64, y: f64, width: f64, height: f64 }` (logical px); commands `browser_show(id: String, url: String, bounds: Bounds)`, `browser_bounds(id, bounds)`, `browser_hide(id)`, `browser_hide_all()`, `browser_back(id)`, `browser_reload(id)`, `browser_close(id)`, `browser_close_many(ids: Vec<String>)`; event `browser-title` with payload `{ id: String, title: String }` and `browser-loaded` `{ id }` emitted to the main webview. `id` is chosen by the webview (Task 6: the artifact URL hashed to `[a-z0-9]{1,24}`), the webview label is `browser-<id>`.
- Pure helpers: `pub fn safari_user_agent(webkit: &str, safari: &str) -> String` (`Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/<webkit> (KHTML, like Gecko) Version/<safari> Safari/<webkit>`); `pub fn allowed(url: &Url) -> bool` (http/https only); `pub fn label_for(id: &str) -> Option<String>` (rejects ids outside `[a-z0-9-]{1,40}`).

- [ ] **Step 1: Failing tests.** `user_agent_reads_like_safari` (contains `Version/` and ends with `Safari/<webkit>`); `only_web_urls_load` (`https`, `http` true; `file`, `tauri`, `javascript`, `about` false); `labels_refuse_odd_ids` (`../x`, empty, uppercase → None).
- [ ] **Step 2:** `cd src-tauri && cargo test browser` → FAIL.
- [ ] **Step 3: Implement.** `browser_show` gets or creates the child (`app.get_window("main")?.add_child(WebviewBuilder::new(label, WebviewUrl::External(url)).user_agent(..).on_navigation(allowed).on_document_title_changed(emit browser-title).on_page_load(emit browser-loaded on Finished).on_new_window(..), position, size)`), else `set_bounds` + `show`; navigates when the URL differs from the one it was created with. Safari versions: read `CFBundleShortVersionString` of `/Applications/Safari.app` and WebKit's version from `/System/Library/Frameworks/WebKit.framework/Resources/Info.plist`, falling back to constants. `on_new_window`: open the popup as a small `WebviewWindow` (same UA) so `window.opener` works for Google; if the real-app check shows claude.ai redirects instead, load in place (`NewWindowResponse::Deny` + `navigate`). Keep a `Mutex<Vec<String>>` of live labels; beyond 6, close the least recently shown.
- [ ] **Step 4:** Tests pass; `cargo build` clean; full checks.
- [ ] **Step 5: Commit** `feat(browser): Native browser webviews for the right panel`.

### Task 5: The panel's browser tabs

**Files:**
- Create: `src/app/browser-tabs.ts` (pure helpers), `src/app/browser-view.tsx` (address bar + placeholder)
- Modify: `src/app/git-panel.tsx` (view union, tab row, body), `src/app/use-layout.ts` (`browserWidth`), `src/app.tsx` (wiring), `src/dev/fixtures.ts`, `src/dev/mock-ipc.ts` (`?artifacts`, a publishing chat)
- Test: `src/app/browser-tabs.test.ts`, `src/app/use-layout` tests if present

**Interfaces:**
- Consumes: `Artifact`, `isNew`, `useCatalog` methods (Task 2); `onArtifact` (Task 3).
- Produces: `export type PanelView = 'changes' | 'checks' | { browser: string }`; `export function browserTabs(artifacts: Artifact[] | undefined): Artifact[]` (open ones, newest `at` first); `export function afterClose(view: PanelView, tabs: Artifact[], closedUrl: string): PanelView` (next tab to the right, else left, else `'changes'`); `GitPanel` props gain `artifacts: Artifact[]`, `view: PanelView`, `onView(view)`, `onCloseArtifact(url)`, `browser: ReactNode` (the body when a browser tab is the view); `Layout.browserWidth: number | null`, `LIMITS.browser`, `BROWSER_WIDTH = 'clamp(420px, 45vw, 1100px)'`.

- [ ] **Step 1: Failing tests.** `browserTabs` drops closed, sorts newest first, handles `undefined`; `afterClose` cases (closing the shown middle tab → right neighbour; last → left; only → `'changes'`; closing a tab not shown → view unchanged).
- [ ] **Step 2:** `bun test src/app/browser-tabs.test.ts` → FAIL.
- [ ] **Step 3: Implement.** The view lives in `app.tsx` per workspace (`Record<workspaceId, PanelView>`), so `onArtifact(live)` can set it: `addArtifact` then, if the workspace is on screen, `update({ gitOpen: true })` and view `{ browser: url }`; never focus the browser. Showing a browser tab calls `seeArtifact`. Tabs: `Tab` look, 14px `GlobeIcon`, title truncated `max-w-40`, tooltip title + URL, `done` dot when `isNew`, context menu Close; row `overflow-x-auto` with hidden scrollbar; 160ms enter. Panel width: `browserWidth` when the view is a browser tab, else `gitWidth`; the `Slide` width animates the switch (200ms). `BrowserView`: address bar (`h-bar`, `bg-chrome`, back, reload, URL `text-xs text-faint truncate`, "Open in browser" via `openUrl`), then a `flex-1` placeholder `div` with `ref` (Task 6 drives it). In the web preview the placeholder shows the artifact title and URL on a `bg-chrome` card. Fixtures: a chat with `quickstart`, a Write to a scratchpad path, a publish with result text; `?artifacts` starts a workspace with two artifacts, one new.
- [ ] **Step 4:** Tests pass; full checks; preview check at 1000×600 and 1440×900 (tab row, new dot, Close fallback, width slide).
- [ ] **Step 5: Commit** `feat(ui): Artifacts as tabs of the right panel`.

### Task 6: Keeping the native view in place and out of the way

**Files:**
- Create: `src/app/use-browser.ts` (sync hook), `src/app/overlays.ts` (counter)
- Modify: `src/app/browser-view.tsx`, `src/app/splitter.tsx` (`Slide` reports `sliding`), `src/app.tsx`, the floating surfaces (`components/ui/menu.tsx`, `context-menu.tsx`, the app's `context-menu.tsx`, `picker.tsx`, `new-workspace.tsx` dialog, `toast.tsx`, tooltips) to hold an overlay while open
- Test: `src/app/use-browser.test.ts`, `src/app/overlays.test.ts`

**Interfaces:**
- Produces: `overlays.ts`: `export function holdOverlay(): () => void` (returns the release), `export function subscribeOverlays(fn: (open: boolean) => void): () => void`, `export function useOverlayHold(open: boolean): void`; `use-browser.ts`: `export function browserShown(s: { mode: 'normal' | 'git' | 'settings'; panelOpen: boolean; view: PanelView; overlays: boolean; sliding: boolean }): boolean`; `export function browserId(url: string): string` (stable FNV-1a hex of the URL); `export function useBrowser(view: PanelView, placeholder: RefObject<HTMLDivElement>, shown: boolean): void` (show/hide/bounds via the Task 4 commands, rAF-throttled `ResizeObserver` + window resize); `closeWorkspaceBrowsers(urls: string[])` calling `browser_close_many`.

- [ ] **Step 1: Failing tests.** `browserShown` table: shown only for `mode 'normal'`, panel open, browser view, no overlay, not sliding; each other row false. `holdOverlay`: two holds → open; one release → still open; both → closed; double release is harmless. `browserId` is stable and matches `[a-z0-9]{1,24}`.
- [ ] **Step 2:** `bun test src/app/use-browser.test.ts src/app/overlays.test.ts` → FAIL.
- [ ] **Step 3: Implement.** `useBrowser` sends `browser_show` with bounds from `getBoundingClientRect()` when shown, `browser_hide_all` when not; never `browser_focus`. Each floating surface calls `useOverlayHold(open)`. `Slide` exposes `sliding` for its 200ms; the splitter drag counts as sliding. Removing a workspace (`removeWorkspace` in `app.tsx`) calls `closeWorkspaceBrowsers` for its artifacts. Until `browser-loaded` arrives for the shown id, the placeholder shows a quiet spinner (the native view is shown only once loaded, so no white flash). Listen to `browser-title` to show the page title on tabs whose stored title is empty (and save it with `addArtifact(..., live=false)`).
- [ ] **Step 4:** Tests pass; full checks.
- [ ] **Step 5: Commit** `feat(browser): Keep the page in place and never over a menu`.

### Task 7: Docs and the real-app hand-off

**Files:**
- Modify: `CLAUDE.md` (one product line under the panel/tabs decisions)

- [ ] **Step 1:** Add: "**Artifacts** Claude publishes (Claude Code's own `Artifact` tool, Settings › Chats) open in the right panel's browser, one tab each, logged in to claude.ai once; they never take the keyboard."
- [ ] **Step 2:** Full checks.
- [ ] **Step 3:** Hand the owner the real-app checklist from the spec's "Checks before calling it done" with `bun run dev`.
- [ ] **Step 4: Commit** `docs: Artifacts in the product decisions`.
