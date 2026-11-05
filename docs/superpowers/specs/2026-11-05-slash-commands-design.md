# Slash commands in the chat composer

## Why

Chats run Claude Code headless, so the TUI's `/` commands are not there: nothing completes,
`/resume` does not exist, and the output of a local command is not told apart from an answer.
The owner wants every everyday Claude command, done cleanly, starting with `/resume`.

## What the user gets

- Typing `/` at the start of the composer opens a menu above it: every command available,
  filtered as they type, each with its argument hint and a one-line description.
- `/resume` lists the project's past sessions and picks one up.
- `/clear`, `/model`, `/effort`, `/rename` do what they do in the TUI, through the app's own
  pickers and in-place editing.
- Everything else Claude Code offers headless (`/compact`, `/context`, `/usage`, `/init`,
  `/review`, `/security-review`, skills like `/code-review`…) runs as in the TUI; its output
  shows as a command card, not as if Claude had answered.

## Facts this rests on (checked with Claude Code 2.1.318)

- The `initialize` control response carries `commands`: `{ name, description,
  argumentHint?, aliases?, builtin? }[]`, ~90 entries, built-ins and skills/plugins together
  (`builtin: true` marks Claude Code's own).
- A command sent as a user message (`/context`) is answered by an `assistant` message whose
  `message.model` is `"<synthetic>"`, markdown text, followed by a normal `result`.
- `/resume`, `/help`, `/rewind`, `/export`, `/status`, `/permissions` are not in the headless
  list.
- Transcripts live in `~/.claude/projects/<cwd, every non-alphanumeric as '-'>/<sessionId>.jsonl` (honour `CLAUDE_CONFIG_DIR`, as `chat_history` does). Lines carry `cwd`;
  `{"type":"ai-title","aiTitle":…}` and `{"type":"custom-title",…}` name the session (last
  one wins); `last-prompt` and `user` lines give the prompts.
- `--resume <id>` from another folder initialises without error.

## Goals

- The menu, keyboard-first, for app commands and Claude's commands alike.
- `/resume` across the whole project.
- App-side versions of the TUI-only commands that make sense here.
- Command output and command prompts rendered as such.

## Non-goals

- `/rewind`, `/export`, `/status`, `/permissions`, `/help` (the menu is the help).
- Commands anywhere but at the start of the composer.
- A settings screen for commands.

## Anti-goals

- A hardcoded list of Claude's commands: the list comes from `initialize`, like the models.
- Simulated keystrokes: each native command calls what the app already does.
- A modal: the menu and the resume picker sit over the composer, keyboard-driven, like the
  existing pickers.

## How (decided)

### The menu

- Opens when the composer's text starts with `/` and the caret is still in the first word;
  filters on that word. After a space it shows only the chosen command's argument hint.
- Order: matches by name prefix, then name substring, then description substring. Within a
  rank: app commands, then Claude's built-ins, then skills (labelled with their plugin, from
  the `name` prefix before `:`). Aliases match too.
- ↑↓ move, Enter or Tab accepts, Esc closes (the text stays). Accepting a command with an
  argument hint inserts `/name ` and waits; one without runs at once. Enter with a full
  `/name args` line runs it.
- Hidden: names starting with `__`, and `color`, `focus`, `heapdump`, `workflow-launch-exec`,
  `extra-usage`, `agents` (meaningless or removed in a headless window).
- Each chat's list is its own Claude's: the `initialize` answer `wake()` already asks for
  carries `commands` for that folder (project skills and commands included), kept in
  `ChatState`. Until a chat has answered, the menu uses the app-wide list from
  `claude_models` (asked from `$HOME`, cached like the models), then the app commands alone.

### App commands (handled by the app)

- **`/resume [search]`** opens the resume picker (below).
- **`/clear`**: the chat's process stops and a fresh one starts in the same tab with no
  `--resume`; the tab empties. The previous session stays on disk, findable by `/resume`.
- **`/model [name]`**: no argument opens a picker over the composer listing the models from
  Claude Code (the same list and labels as the ⌘N composer); a choice, or an argument
  matching a model's value or label, sends `/model <id>` to Claude and stores it on this
  chat's record only, so a later resume uses it. The default for new chats is unchanged.
- **`/effort [level]`**: same with the Intelligence levels and `/effort <level>`.
- **`/rename [title]`**: no argument puts the tab title in place-edit; an argument sets it.
  Either way the title is also sent as `/rename <title>` so `/resume` shows it. Renaming a
  tab the other ways (double-click, right-click) changes the tab only.
- The commands the app sends for you show in the conversation like typed ones (chip and
  card), as the TUI shows them.

### Claude's commands

- Sent as typed, as a user message. The user turn shows as a command chip (`/compact focus on
  tests`), not as prose.
- An assistant message with model `<synthetic>` that follows a command prompt renders as a
  command output card (other `<synthetic>` messages, such as API errors, stay as they are): muted,
  markdown, collapsed past ~12 lines with "Show all". Replayed transcripts render the same
  (today `<local-command-…>` lines are dropped; keep their stdout as a card when non-empty).

### `/resume`

- Lists sessions whose `cwd` is the project's main checkout or below it, one of its git
  worktrees (`git worktree list`), or under the app's worktrees folder for this project
  (`data_dir()/worktrees/<projectId>/`, deleted workspaces included).
- New Tauri command `claude_sessions(project_id) -> Vec<Session>`, `Session { id, cwd, title,
  firstPrompt, updatedAt (ms), sizeBytes }`, newest first. Reads only what a row needs (title
  lines and the first prompt), not whole transcripts into the webview.
- Picker over the composer: search field (prefilled with `/resume`'s argument) filtering on
  title and first prompt; rows show title (else first prompt), origin (workspace name, `main`,
  or the folder's last segment for a deleted worktree), age, size. Sessions of the current
  workspace first, then the rest by date. Keyboard like the other pickers.
- Choosing one:
  - already open in a tab → go to that tab;
  - its `cwd` is an existing workspace → new chat tab there, resumed, and the app switches to
    that workspace;
  - otherwise → new chat tab in the current workspace, resumed.
  - The new tab takes the session's title and is saved like any chat (so it survives restarts).
- Empty state: "No earlier sessions in this project."

## Left to the builder

- Component split and file names; the menu's look within the existing picker/composer styles.
- How `/model` validates its argument against the models list.
- Exact collapse threshold of command cards.

## Checks

- Unit tests: menu ranking and filtering (prefix > substring > description; aliases; hidden
  names), command-line parsing (`/name args`), session origin labelling and ordering,
  transcript title extraction (ai-title vs custom-title, last wins), `<synthetic>` detection
  in the chat reducer.
- Rust test: `claude_sessions` on a temp `CLAUDE_CONFIG_DIR` with two fake transcripts in and
  one out of the project.
- Manual: `/` menu, `/context` card, `/compact`, `/clear`, `/model`, `/resume` from another
  workspace and from main.
