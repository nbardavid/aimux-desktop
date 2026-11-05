# Slash Commands Implementation Plan

> **For agentic workers:** steps use checkbox (`- [ ]`) syntax. TDD: failing test, see it fail, implement, see it pass.

**Goal:** a `/` menu in the chat composer with Claude's headless commands and the app's own
(`/resume`, `/clear`, `/model`, `/effort`, `/rename`), command prompts and outputs rendered as
such, and a project-wide `/resume` picker.

**Architecture:** pure logic in `src/chat/commands.ts` (list, ranking, parsing); the reducer
learns commands and command cards; `ChatView` hosts the menu; `app.tsx` runs app commands
through `use-chats`; a Rust `claude_sessions` command feeds the resume picker.

**Tech Stack:** React/TypeScript, bun test; Rust std + serde_json; Tauri commands.

**Spec:** `docs/superpowers/specs/2026-11-05-slash-commands-design.md`

## Global Constraints

- The command list comes from Claude Code (`initialize` → `commands`), never hardcoded; only
  the app commands and the hidden list are fixed.
- Hidden names: start with `__`, or one of `color`, `focus`, `heapdump`,
  `workflow-launch-exec`, `extra-usage`, `agents`.
- App commands, in this order: `resume [search]`, `clear`, `model [name]`, `effort [level]`,
  `rename [title]`. Their descriptions: "Pick up an earlier session of this project",
  "Start a fresh session in this tab", "Switch this chat's model", "Set how hard this chat's
  model thinks", "Rename this chat".
- No modal; keyboard first; reuse existing picker/composer styles and tokens; English copy.
- bun only. No new dependency. Commit only when the owner asks.

## Review Focus

- A `/path/to/file` or `/` alone typed as a normal message → no command runs; `/unknown args`
  is sent to Claude as typed (Task 2 test: `parseCommand` returns the name; the app only
  intercepts its own names).
- A chat that has not answered `initialize` yet → menu still works from the app-wide list
  (Task 2 test on list merging with an empty per-chat list).
- `<synthetic>` API error after a normal prompt → stays an assistant message, not a card
  (Task 1 test).
- A transcript whose folder holds sessions of another project with a common path prefix
  (`/dev/app` vs `/dev/app-old`) → not listed (Task 3 test).
- Resuming a session already open in a tab → no second Claude on it (Task 4 test on
  `resumeTarget`).

---

### Task 1: Reducer: commands, command prompts, command cards

**Files:** Modify `src/chat/model.ts`; Test `src/chat/model.test.ts`

**Interfaces — Produces:**

- `export interface SlashCommand { name: string; description: string; argumentHint: string; aliases: string[]; builtin: boolean }`
- `export function parseCommands(json: unknown): SlashCommand[]` (from an `initialize` response's `commands`, tolerant of missing fields)
- `ChatState` gains `commands: SlashCommand[]` (initial `[]`), set from a `control_response` whose `response.response.commands` is an array.
- `Block` gains `{ kind: 'command'; name: string; args: string }` (a user turn that is a command) and `{ kind: 'output'; text: string }` (a command's output).
- `addUserTurn`: text matching `/^\/(\S+)\s*([\s\S]*)$/` makes a `command` block instead of `text`. Same in `replayTranscript` and the `aimux_sent` replay path.
- `onAssistant`: when `message.model === '<synthetic>'` and the previous turn is a user turn whose first block is `command`, the turn's text blocks become one `output` block.
- `replayTranscript`: a `system` line with `subtype: 'local_command'` whose `content` holds non-empty `<local-command-stdout>…</local-command-stdout>` becomes an `output` turn; empty ones are skipped (as today).

- [ ] **Step 1: Failing tests**

```ts
test('initialize carries the chat’s commands', () => {
  const line = JSON.stringify({
    response: {
      response: {
        commands: [{ name: 'compact', description: 'd', argumentHint: '<x>', builtin: true }],
      },
      subtype: 'success',
    },
    type: 'control_response',
  })
  expect(reduceLine(initialChat, line).commands[0]).toEqual({
    aliases: [],
    argumentHint: '<x>',
    builtin: true,
    description: 'd',
    name: 'compact',
  })
})
test('a typed command shows as a command', () => {
  expect(addUserTurn(initialChat, '/compact keep tests', 'u').turns[0].blocks[0]).toEqual({
    args: 'keep tests',
    kind: 'command',
    name: 'compact',
  })
})
test('synthetic output after a command is a card', () => {
  const s = addUserTurn(initialChat, '/context', 'u')
  const out = reduceLine(
    s,
    JSON.stringify({
      message: { content: [{ text: '## Context', type: 'text' }], id: 'm', model: '<synthetic>' },
      type: 'assistant',
    })
  )
  expect(out.turns.at(-1)?.blocks).toEqual([{ kind: 'output', text: '## Context' }])
})
test('a synthetic error after a normal prompt stays a message', () => {
  const s = addUserTurn(initialChat, 'hello', 'u')
  const out = reduceLine(
    s,
    JSON.stringify({
      message: { content: [{ text: 'API Error', type: 'text' }], id: 'm', model: '<synthetic>' },
      type: 'assistant',
    })
  )
  expect(out.turns.at(-1)?.blocks[0].kind).toBe('text')
})
test('replayed local command output becomes a card', () => {
  const lines = [
    JSON.stringify({
      content: '<local-command-stdout>Set model to opus</local-command-stdout>',
      subtype: 'local_command',
      type: 'system',
    }),
  ]
  expect(replayTranscript(lines).turns[0].blocks).toEqual([
    { kind: 'output', text: 'Set model to opus' },
  ])
})
```

- [ ] **Step 2:** `bun test src/chat` → FAIL. **Step 3:** implement. **Step 4:** PASS. Every existing test still passes.

---

### Task 2: Command list, ranking, parsing, and the composer menu

**Files:** Create `src/chat/commands.ts`, `src/chat/commands.test.ts`, `src/app/command-menu.tsx`; Modify `src/app/chat-view.tsx`, `src/app/use-models.ts` (cache the app-wide command list from `claude_models` beside the models: `claude_models` already returns the initialize answer's `models` — have it return `{ models, commands }` JSON and keep `parseModels` working on the `models` part), `src-tauri/src/chat.rs` (`claude_models` returns the whole `response.response` object as JSON), `src/styles.css`

**Interfaces — Produces:**

- `export const APP_COMMANDS: SlashCommand[]` (Global Constraints; `builtin: false`, `aliases: []`, hints `[search]`, ``, `[name]`, `[level]`, `[title]`)
- `export function availableCommands(chat: SlashCommand[], appWide: SlashCommand[]): SlashCommand[]` — app commands first, then `chat` if non-empty else `appWide`, minus hidden names and minus Claude's own `resume`/`clear`/`model`/`effort`/`rename` (the app's replace them), de-duplicated by name.
- `export function rankCommands(list: SlashCommand[], query: string): SlashCommand[]` — rank 0 name/alias prefix, 1 name/alias substring, 2 description substring (case-insensitive); stable within a rank (so app, built-in, skill order holds); empty query keeps the list.
- `export function parseCommand(text: string): { name: string; args: string } | null` — `/name rest` with name `[\w:.-]+`; `/` alone, or a first word containing another `/` (a path), returns null.
- `export const isAppCommand = (name: string) => boolean`
- `ChatView` gains props `commands: SlashCommand[]` and `onCommand: (name: string, args: string) => void`. On submit, a line whose `parseCommand` name is an app command calls `onCommand` instead of `onSend`; anything else goes to `onSend` as today.
- `CommandMenu` sits above the composer while the draft matches `/^\/\S*$/` (first word, no space yet): rows show `/name`, the hint muted, the description on one line, a small plugin label for `plugin:name`. ↑↓ / Ctrl-N/P, Enter or Tab accepts (hint non-empty → draft becomes `/name `; else runs as a submit), Esc closes until the draft changes. Once a space is typed, a single muted line shows the chosen command's hint. Mouse click accepts.

- [ ] **Step 1: Failing tests** (`commands.test.ts`)

```ts
const c = (name: string, o: Partial<SlashCommand> = {}): SlashCommand => ({
  aliases: [],
  argumentHint: '',
  builtin: true,
  description: '',
  name,
  ...o,
})
test('prefix beats substring beats description', () => {
  const list = [c('recompact'), c('other', { description: 'compact it' }), c('compact')]
  expect(rankCommands(list, 'comp').map((x) => x.name)).toEqual(['compact', 'recompact', 'other'])
})
test('aliases match', () => {
  expect(rankCommands([c('usage', { aliases: ['cost'] })], 'cos')[0]?.name).toBe('usage')
})
test('app commands lead and replace Claude’s, hidden ones go', () => {
  const names = availableCommands([c('compact'), c('model'), c('color'), c('__x')], []).map(
    (x) => x.name
  )
  expect(names.slice(0, 5)).toEqual(['resume', 'clear', 'model', 'effort', 'rename'])
  expect(names).toContain('compact')
  expect(names.filter((n) => n === 'model')).toHaveLength(1)
  expect(names).not.toContain('color')
  expect(names).not.toContain('__x')
})
test('the app-wide list stands in until the chat answers', () => {
  expect(availableCommands([], [c('compact')]).map((x) => x.name)).toContain('compact')
})
test('parsing', () => {
  expect(parseCommand('/compact keep tests')).toEqual({ args: 'keep tests', name: 'compact' })
  expect(parseCommand('/ponytail:ponytail-review')).toEqual({
    args: '',
    name: 'ponytail:ponytail-review',
  })
  expect(parseCommand('/')).toBeNull()
  expect(parseCommand('/usr/bin/env is weird')).toBeNull()
  expect(parseCommand('hello /compact')).toBeNull()
})
```

- [ ] **Step 2:** FAIL. **Step 3:** implement, wire into `ChatView`. **Step 4:** PASS; `cargo test` still passes.

---

### Task 3: `claude_sessions` (Rust)

**Files:** Create `src-tauri/src/sessions.rs` (+ tests); Modify `src-tauri/src/lib.rs`

**Interfaces — Produces:**

- `#[tauri::command(async)] pub fn claude_sessions(project_id: String) -> Result<Vec<Session>, String>`
- `#[serde(rename_all = "camelCase")] pub struct Session { id: String, cwd: String, title: String, first_prompt: String, updated_at: u64, size_bytes: u64 }` — `updated_at` is the file's mtime in ms; newest first.
- `pub fn sessions_in(root: &Path, roots: &[PathBuf]) -> Vec<Session>` (pure enough to test): scans `root/*/*.jsonl`, keeps a file when its first line carrying `cwd` has a cwd equal to one of `roots` or under it (`cwd == r` or `cwd.starts_with(r + "/")`, by path components, so `/dev/app-old` is not under `/dev/app`). Title: the last `custom-title` (field `customTitle`) else last `ai-title` (`aiTitle`) else empty. First prompt: first `user` line whose text is not harness text (`<command-`, `<local-command-`, `<system-reminder`, `<bash-`), trimmed to 200 chars. Reads files line by line; skips sidechain files (`agent-*.jsonl`).
- `claude_sessions` builds `roots` from the catalog: the project's main path, every path from `git worktree list --porcelain` in it, and `data_dir()/worktrees/<project_id>`; `root` is `$CLAUDE_CONFIG_DIR/projects` or `~/.claude/projects`. Only folders whose name starts with the slug of one of the roots are opened (slug = every non-alphanumeric char as `-`).

- [ ] **Step 1: Failing tests** — temp dir with three fake transcripts: one with cwd `/p/app` (a `custom-title` and a later `ai-title` → the custom title wins), one with cwd `/p/app/sub` and only a prompt, one with cwd `/p/app-old`. Assert `sessions_in(tmp, &[PathBuf::from("/p/app")])` returns exactly the first two, titles/prompts right, newest first.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** `cargo test && cargo clippy --all-targets -- -D warnings` PASS.

---

### Task 4: App commands and the resume picker

**Files:** Create `src/app/resume-picker.tsx`, `src/app/resume.ts`, `src/app/resume.test.ts`; Modify `src/app/use-chats.ts`, `src/app.tsx`, `src/app/chat-view.tsx` (only to expose an in-place title edit trigger if needed)

**Interfaces — Consumes:** Task 1 blocks, Task 2 `onCommand`, Task 3 `claude_sessions`.
**Produces:**

- `use-chats`: `clear(id)` (stop the process, reset the state to `initialChat`, `sessionId: null`, wake fresh); `setModel(id, model)` / `setEffort(id, effort)` (update the record, send `/model <id>` / `/effort <level>` through `send`); `openSession(workspaceId, cwd, sessionId, title): string` (creates a chat record with that `sessionId` and title, wakes it — it resumes from the transcript — returns the chat id).
- `resume.ts`: `export function resumeTarget(session: Session, openChats: { id: string; sessionId: string | null; workspaceId: string }[], workspaces: { id: string; path: string }[], currentWorkspaceId: string): { kind: 'tab'; chatId: string; workspaceId: string } | { kind: 'open'; workspaceId: string; cwd: string }` — open tab wins; else the workspace whose `path === session.cwd`; else current workspace (cwd = its path).
  `export function originLabel(session, workspaces, mainPath): string` — workspace name, `main` for the main checkout (or below it), else the cwd's last segment.
  `export function orderSessions(sessions, currentPath): Session[]` — current workspace's first, then the rest, each by `updatedAt` desc.
- `ResumePicker`: built on `Picker` (filterable, initial query from `/resume`'s args — add an optional `initialQuery` prop to `Picker`), rows `label` = title or first prompt, `sub` = first prompt when a title exists, `meta` = `origin · 3h ago · 120 KB`. Empty: "No earlier sessions in this project." Loading: "Loading sessions…".
- `app.tsx` `onCommand(chatId, name, args)`:
  - `resume` → picker; on pick, `resumeTarget` → select that tab, or `openSession` in the target workspace and switch to it.
  - `clear` → `chats.clear`.
  - `model` / `effort` → with args matching the models list (value or label, case-insensitive) apply directly; else open a `Picker` anchored over the composer listing models (or the chat model's effort levels, labels from `effortLabel`), on pick apply.
  - `rename` → with args: set the record title and `send('/rename ' + args)`; without: start the tab's existing in-place rename.

- [ ] **Step 1: Failing tests** (`resume.test.ts`): `resumeTarget` for each of the three cases (incl. a session open in a tab of another workspace → `tab`); `originLabel` for workspace / main / deleted; `orderSessions` puts the current workspace first.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** all checks: `bun run lint && bun run format && bun test && bunx tsc --noEmit && (cd src-tauri && cargo test)`.

---

### Task 5: Trial (owner)

Hand over: `bun run dev` (aimux Dev). Try `/` menu and filtering; `/context` (card); `/compact`;
`/clear`; `/model` with and without argument; `/rename x`; `/resume` picking a session from
another workspace, from `main`, and one already open.
