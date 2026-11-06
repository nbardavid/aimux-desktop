# The Conductor pass — design direction

Date: 2026-11-06. Inputs: the owner's Conductor screenshot (`scratchpad/ref/conductor-1.png`),
our round-2 screens (`scratchpad/pm/round2/`, `scratchpad/dev/round2a/`), CLAUDE.md, DESIGN.md,
the CTO's Run C radius decision (4 / 6 / 8 / 12). This document is the spec: where it gives a
value, use that value.

## How the reference was measured

The Conductor shot is 2320 px wide and downscaled. The traffic lights (12 pt, 20 pt pitch) and the
top bar (65 px, our 40 px `h-bar`) both give 1.65 px per point, so the window is about
1406 × 874 pt, close to our 1440 × 900 shots. Conductor's sans has a larger x-height than SF Pro,
so the sizes below are **SF sizes that match Conductor's x-heights**, not its CSS sizes.

| Conductor, measured            | x-height   | Line or row pitch        | SF equivalent         |
| ------------------------------ | ---------- | ------------------------ | --------------------- |
| Chat prose                     | 7.9 pt     | 24 pt line               | **15 px / 24 px**     |
| User bubble, composer text     | 7.3 pt     | 45 pt bubble             | **14 px / 22 px**     |
| Sidebar rows                   | 7.0 pt     | 36 pt row, 38 pitch      | **13 px**, 36 px rows |
| Workspace title in the top bar | 7.3 pt     |                          | **14 px / 600**       |
| Tabs, git tabs, file names     | 6.7–7.3 pt | 32 pt file rows          | **13 px**, 32 px rows |
| Ages, chips, counts, hints     | 6.1 pt     |                          | **12 px**             |
| Composer box                   |            | 151 pt tall, 8 pt radius | see Composer          |

Ours today, at the same scale: prose 14 px / 22.4, user bubble 14 px, sidebar 13.5 px, tabs
13 px, file paths 12.5 px **mono**. The CTO's "13 px everywhere" is close: the real problem is
that **nothing is bigger or smaller than anything else**. Conductor's prose sits about 15 % above
its chrome and its meta about 15 % below. Ours is flat.

Colours, sampled (Conductor → ours):

| Surface              | Conductor                                      | Ours today                    |
| -------------------- | ---------------------------------------------- | ----------------------------- |
| Chat                 | `#ffffff`                                      | `#ffffff`                     |
| Top bar / tab strip  | `#fafafa` band, hairline `#eaeaea`             | `#ffffff`                     |
| Sidebar              | `#fdfdfd`, selected `#f0f0f0`                  | `#fdfcfc`, selected `#f1f0f0` |
| Composer             | `#fafafa`, border `#eaeaea`, soft shadow below | `#f8f6f3`, tan focus ring     |
| User bubble          | `#faf8f6` (faint warmth), no border            | `#f4f1ec` (beige)             |
| Prose ink            | `#272725`                                      | `#2b2826`                     |
| Read sidebar title   | `#7f7f7f`; unread bold dark                    | `#6c6a69` for every row       |
| Section labels       | `#a6a6a5`                                      | `#9b9999`                     |
| Icons, folders, meta | `#8a8884` (warm grey)                          | `#8d8885` (same)              |
| PR head "ready"      | whole band `#f5fcf6`, ink `#5f9a57`            | white band, green chip        |
| Diff counts          | `+` `#639c5f`, `−` `#b0534a`                   | `#4d8a5b`, `#c43a2b`          |

Conductor's **surfaces are neutral** and only its **inks are warm**. Ours is the other way
round: beige surfaces, so the app reads tan. CLAUDE.md asks for warm neutrals, so keep the
warmth in the inks and take it out of the fills.

---

## 1. The diagnosis, ranked by visual impact

### D1. Every tool call is its own row (the biggest gap)

- **Conductor:** one grey line per run of work: `› 5 tool calls ▤`, `› 17 tool calls, 3 messages >_ ✎`.
  The answer is the only dark text in the turn. In the screenshot, a whole working session
  takes three lines of chrome.
- **Ours** (`src/app/chat-view.tsx`, `BlockView`): every tool is a 28 px row with a green dot, a
  bold name and a mono path (`● Edit src/app/pointer.ts`). Every intermediate message shows
  too. A ten-tool turn is a wall of dots and mono.
- **Why theirs reads better:** the eye finds what Claude said, not how it got there. That takes
  60–80 % of the vertical noise out of a long chat.

### D2. A flat type scale, and mono used for identifiers

- **Conductor:** prose 15 px / 24, chrome 13, meta 12. Mono only for code and +/− counts. File
  names are sans: grey folder, dark name.
- **Ours** (`src/styles.css` `.md` 14/1.6; `file-list.tsx` paths `font-mono text-[12.5px]`;
  `TurnEnd` mono; tool summaries mono; M/A/D letters mono): 13–14 px everywhere, with Geist Mono
  scattered across the git panel and the chat. Mono reads technical and busy.
- **Why theirs reads better:** a size step gives the screen a reading order. Sans file names are
  quieter, and you can read their shape at a glance.

### D3. Beige fills and boxes everywhere

- **Conductor:** the chat is pure white with almost no boxes. Inline code gets a white chip
  with a hairline border. The user bubble is a breath of warmth (`#faf8f6`). The composer is
  `#fafafa` with a hairline.
- **Ours:** user bubble `#f4f1ec` (`USER` in chat-view.tsx); composer `#f8f6f3` with a tan
  4 px glow; command cards `border bg-chrome rounded-xl`; the permission card has a heavy
  border and a shadow; tables are fully gridded; inline code sits on a grey fill.
- **Why theirs reads better:** fewer containers, and fills that don't compete with the text.
  Ours looks sepia next to it.

### D4. The sidebar shows plumbing, not work

- **Conductor:** one line per workspace: title, age at the right (`10h`, `7d`). Unread titles
  are bold and dark, read ones grey. A 2 px accent bar marks some rows. No icons, no counts.
- **Ours** (`src/app/sidebar.tsx`): coloured project avatars as group headers, a branch icon
  on every row, `+268 −233` on every row, ⌘N/⌘P key caps in the nav, 34 px rows with 13.5 px
  text, every row the same grey.
- **Why theirs reads better:** you scan for state (what's new, what's recent). Ours you have
  to parse.

### D5. The git head wraps, and the panel is a terminal listing

- **Conductor:** one 40 px row: `#8376 ↗ ▲ Ready to merge … Merge`. The **whole band is tinted
  by the PR state** (pale green when ready). Text tabs. File rows are 32 px: folder `#898886`,
  name `#282827`, mono counts, then a 14 px **coloured status square** at the far right.
- **Ours** (`git-panel.tsx` `Head`, `file-list.tsx`): at 1440 the head wraps into two rows
  (`#128 ↗ Checks failing` / `Push 2 Merge`, see `01-main-1440.png`). Coloured M/A/D letters
  sit in a left gutter. Paths are mono. The active tab is a heavy `#ecebeb` pill.
- **Why theirs reads better:** the PR state reads as a colour field without any text being
  read, and the list is a list of names, not of codes.

### D6. The tab bar has no chrome band, and icons on every tab

- **Conductor:** a `#fafafa` band with a hairline under it. The workspace title is larger. Tabs
  are plain text: grey when inactive, dark with a 2 px tan underline when active. The tools at
  the right are borderless icons.
- **Ours** (`top-bar.tsx`, `tab-bar.tsx`): a white bar the same colour as the chat, a
  `MessageCircle` icon before every chat tab, a bordered "Diff" button.
- **Why theirs reads better:** the band separates the window chrome from the content without
  adding a line, and plain-text tabs let the titles carry the meaning.

### D7. A small composer

- **Conductor:** 151 pt tall, `#fafafa`, hairline `#eaeaea`, a soft shadow below, 8 pt radius.
  A `⌘L to focus` hint at the top right. A toolbar at the bottom (model, effort, mode icons on
  the left; `+` and an ink send button on the right).
- **Ours:** about 91 pt tall, beige, with a tan glow on focus. The model chip is the only thing
  in the toolbar.
- **Why theirs reads better:** the place where you type is the most inviting thing on screen.
  Ours looks like a search field.

### D8. Turns end with nothing to act on

- **Conductor:** every finished turn ends with a footer: `2m, 4s ⧉ ⋯`, then chips for the
  files it changed (`HeroHeadline.tsx +2 −7`), wrapping.
- **Ours** (`TurnEnd`): one mono line (`12.3s · $0.123`) under the **last** turn only.
- **Why theirs reads better:** each turn closes visibly. You see what changed without opening
  the git panel, and the chips lead straight into the diff.

### D9. Key caps everywhere

- **Conductor:** shortcuts are plain faint glyphs (`⌘L to focus`, `Start Dev ⌘R`).
- **Ours** (`components/ui/kbd.tsx`, a bordered mono box): ⌘N and ⌘P in the sidebar nav, three
  boxed caps in the permission card, caps in ⌘P's footer and in popovers.
- **Why theirs reads better:** a boxed cap is a small widget, and twelve of them make visual
  static.

### D10. Vertical rhythm

- **Conductor:** 24 px between turns, 12 px between blocks inside a turn, sidebar rows
  36 px on a 38 px pitch, file rows 32 px, the user bubble 44–45 px tall.
- **Ours:** one 18 px gap for everything (`gap-[18px]`), 10 px inside turns, 34 px sidebar
  rows, about 30 px file rows.
- **Why theirs reads better:** the turn is the unit you read. Space between turns groups its
  blocks with no line needed.

### D11. Scroll affordances (the CTO missed these)

- **Conductor:**
  - a **turn ruler** at the right edge of the chat: 1.5 px ticks on an 8 px pitch, `#dbdbd9`,
    the one in view drawn in ink. It shows where you are in a long chat and jumps on click;
  - a 28 px **↓ button** at the bottom left of the column when you have scrolled up;
  - native overlay scrollbars that hide when idle.
- **Ours:** a custom always-on 10 px WebKit scrollbar (`styles.css`). No position cue, and no
  way back down except scrolling.
- **Why theirs reads better:** long chats are the norm here, and the ruler makes their length
  readable.

### D12. Status colours are a notch too loud (the CTO missed this)

- **Conductor:** green `#5f9b58`, red `#b0534a`, yellow `#e8cf5a`, all softened.
- **Ours:** `--critical #c43a2b` (an orange-red that shouts), plus raw hexes in components
  (`#a2301f`, `#2f6b3e`, `#2f8a4c`, `#7a5a08`, `#f4f1ec`, `#f8f6f3`) that are not tokens.
- **Why theirs reads better:** the colours still say "attention" without making a red or green
  count the loudest thing on screen.

Things the CTO listed that **did not hold up**:

- **"A larger white composer."** It is larger, but it is not white: it is a `#fafafa` fill on a
  white chat.
- **"15 px prose."** Right, but only once converted to SF. Conductor's font has a bigger
  x-height, so matching its CSS size would not match its look. Keep the system font
  (CLAUDE.md) at 15 px.
- **Icon strokes.** Conductor's are about 0.9 pt at 16 pt and grey `#8c8984`, which is what
  Lucide at `size-4` in `--faint` already gives. **Don't touch icon stroke widths.** What
  reads heavier in ours is the **number** of icons (branch icons, chat-bubble icons, avatars,
  boxed key caps), not their weight.

---

## 2. The direction

### 2.0 Tokens (`src/styles.css`, and DESIGN.md's Tokens section)

Type scale. This replaces the "two sizes" comment. Every size in a component comes from this
table; no `text-[13.5px]` and the like.

| Token / use          | Size / line-height                            | Weight    | Where                                                             |
| -------------------- | --------------------------------------------- | --------- | ----------------------------------------------------------------- |
| `text-2xs`           | 11 / 14                                       | 500       | badges and inbox counts only                                      |
| `text-xs`            | 12 / 16                                       | 400 / 500 | ages, hints, section labels, footers, counts, chips               |
| `text-sm`            | 13 / 18                                       | 400 / 500 | all chrome: sidebar, tabs, menus, file rows, buttons              |
| `text-base`          | 14 / 22                                       | 400 / 600 | user bubble, composer text, top-bar title, PR status, card titles |
| `.md` prose          | 15 / 24                                       | 400       | Claude's answers                                                  |
| `text-lg`            | 20 / 28                                       | 600       | empty-state titles only                                           |
| mono (`--font-mono`) | 12.5 / 20 in code blocks, 12 inline in chrome | 400       | code, tool commands, counts, branch names. **Not file names.**    |

Body default (`body` in styles.css): 13 px / 18 px.

Colours (amended; hex given):

| Token                                        | Now       | New                  | Why                                                |
| -------------------------------------------- | --------- | -------------------- | -------------------------------------------------- |
| `--foreground`                               | `#2b2826` | `#282725`            | a touch less red, Conductor's prose ink            |
| `--chrome`                                   | `#faf9f8` | `#fafaf9`            | the tab band, composer, code blocks, command cards |
| `--muted` `--accent` `--secondary` `--hover` | `#f5f4f3` | `#f4f4f3`            | neutral hover                                      |
| `--active`, `--sidebar-accent`               | `#f1f0f0` | `#efefee`            | the selected row                                   |
| `--border`, `--sidebar-border`               | `#eae8e6` | `#ebeae9`            | less beige hairline                                |
| `--input`, `--line-strong`                   | `#dcd9d6` | `#dddbd9`            |                                                    |
| `--label`                                    | `#9b9999` | `#a3a19f`            | section labels recede further                      |
| `--critical`, `--destructive`                | `#c43a2b` | `#b8473a`            | softer red, still 4.9:1 on white                   |
| `--pill`                                     | `#ecebeb` | **remove**           | replaced by `--muted`                              |
| **new** `--bubble`                           |           | `#f7f6f4`            | user bubble (replaces raw `#f4f1ec`)               |
| **new** `--good-ink`                         |           | `#2f6b3e`            | green text on a green wash (replaces raw hex)      |
| **new** `--critical-ink`                     |           | `#9e3324`            | red text (replaces `#a2301f`)                      |
| **new** `--warn-ink`                         |           | `#7a5a08`            | amber text (replaces raw hex in the sidebar badge) |
| **new** `--good-wash`                        |           | `#f3f8f3`            | PR head band, ready or merged                      |
| **new** `--critical-wash`                    |           | `#fbf3f2`            | PR head band, blocked or failing; the error box    |
| **new** `--merge`, `--merge-hover`           |           | `#2f8a4c`, `#287a42` | the Merge button (replaces raw hexes)              |
| **new** `--tick`                             |           | `#dcdbd9`            | turn-ruler ticks                                   |

Keep `--tan #c29c87` for exactly three things: the active-tab underline, the streaming caret,
and `::selection`. **Remove it from the composer focus ring.**

Radii: the CTO's Run C set, unchanged: `rounded-sm` 4, `rounded-md` 6, `rounded-lg` 8,
`rounded-xl` 12 (`--radius: 8px`, sm = −4, md = −2, xl = +4; drop `2xl`). Conductor's
composer measures 8 pt, which confirms `lg` for cards and the composer.

Heights: `h-bar` 40. Rows: menus 28, tool and group rows 28, nav 32, file and check rows 32,
sidebar workspace rows 36 (48 for the two-line option). Controls inside bars: `h-7`.

Shadows: `--shadow-popover` unchanged. **New** `--shadow-composer:
0 1px 2px rgb(40 39 37 / 0.04), 0 4px 12px -6px rgb(40 39 37 / 0.08)`. Permission card: none.

Scrollbars: **delete** the `::-webkit-scrollbar*` rules from styles.css. WKWebView then draws
macOS overlay scrollbars that hide when idle, as Conductor's do. Keep `[&::-webkit-scrollbar]:hidden`
on the tab strip.

Key caps: change `Kbd` (`components/ui/kbd.tsx`) to a **plain glyph**: no border, no fill,
`text-xs text-faint`, sans (not mono), `tracking-[0.02em]`, `h-auto px-0`. On the ink button:
`text-white/60`. The one place that keeps boxed caps is ⌘P's footer legend (`↵ open ↑↓ move
esc cancel`), which uses a local `KbdBox` class there.

### 2.1 Chat transcript

**Column.** Content `max-w-[720px]`, centred, `px-6`. The ruler gets 24 px to the right of the
column (see below). Gaps: **24 px between turns** (user ↔ assistant), **12 px between blocks
inside an assistant turn**. Top padding 28 px, bottom 24 px.

**Prose (`.md`).**

| Element          | Spec                                                                                                                                                                                                                                |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Body             | 15 / 24, `--foreground`, `text-wrap: pretty`                                                                                                                                                                                        |
| Paragraph margin | 0 0 12 px                                                                                                                                                                                                                           |
| Lists            | `padding-left: 22px`; `li + li` margin-top 4 px; markers `--faint`                                                                                                                                                                  |
| Headings         | h1 18 / 26 600, h2 16 / 24 600, h3 and h4 15 / 24 600; margin 20 px 0 8 px                                                                                                                                                          |
| Links            | `--foreground`, underline `--line-strong`, 2 px offset; hover: underline `--foreground`, 120 ms                                                                                                                                     |
| Inline code      | 13 px mono, **white fill, 1 px `--border`**, `rounded-sm` (4), padding 1 px 5 px                                                                                                                                                    |
| Code block       | 12.5 / 20 mono, `--chrome` fill, 1 px `--border`, `rounded-lg`, padding 12 px 14 px. Copy button at top right, shown on hover: ghost `size-6`, `Copy` 14 px, becomes `Check` for 1.2 s (the in-flight `data-ui` work in styles.css) |
| Table            | 13.5 / 20; **no vertical borders, no outer border**; header 600 `--muted-foreground`, row hairlines `border-b --border`, cells padding 6 px 16 px 6 px 0                                                                            |
| Blockquote       | 2 px `--line-strong` rule, padding-left 12, `--muted-foreground`                                                                                                                                                                    |

**User bubble.** `self-end max-w-[80%]`, `bg-bubble`, no border, `rounded-lg`, padding
11 px 14 px, `text-base` 14 / 22, `--ink-soft`. One line comes out 44 px tall, as in
Conductor. A `/command` bubble: same box, 13 px mono, the name 600 `--foreground`, the
arguments `--ink-soft`. Enter: 280 ms rise (DESIGN.md "new message").

**Exchanges and the tool group.** An _exchange_ is every assistant turn between two user
turns. (`Turn` is one per message id, so an exchange spans several `Turn`s.)

The collapse rule, for a **finished** exchange:

- Find the **last text block** of the exchange (the answer). It stays in place, as prose.
- **Everything before it** (tools, thinking, intermediate text) folds into **one group row**
  above it.
- **Everything after it** (trailing tools, as when a turn was stopped) folds into one group
  row below it.
- With no text block at all, everything folds into one row.
- Output cards (`kind: 'output'`) and notes are never folded.

This reproduces both Conductor cases: "text, then `5 tool calls`" and "`17 tool calls,
3 messages`, then the answer".

Group row (collapsed):

- `h-7`, no background. Contents, gap 6 px:
  - `ChevronRight` 14 px `--label`;
  - the label at 14 px `--faint`: "`5 tool calls`", "`17 tool calls, 3 messages`", with
    "`· 1 failed`" in `--critical-ink` when a tool errored;
  - up to 4 kind icons, 14 px `--label`, gap 4 px, in first-seen order: `FileText`
    (Read/Grep/Glob/LS), `SquareTerminal` (Bash), `FilePen` (Edit/Write/MultiEdit/NotebookEdit),
    `Globe` (WebFetch/WebSearch), `Bot` (Task/Agent), `Brain` (thinking only).
- Hover: label and chevron go to `--muted-foreground`, 120 ms. No fill.
- Pluralise properly: "1 tool call", "1 message". Thinking blocks count as nothing in the
  label; only the icon shows them.

Group expanded:

- The chevron rotates 90°, 180 ms. The body expands with height plus fade, 180 ms ease-in-out,
  no jump (DESIGN.md expand/collapse).
- The body is a column with gap 2 px and `pl-5`, so it lines up under the label, not the
  chevron. It lists the folded blocks in order:
  - **tool rows:** `h-7`, the existing 7 px status dot, the name 13 px 500 `--foreground`, the
    summary 12 px mono `--faint` truncated. Each still expands to its output (the current
    `ToolBody`, `rounded-lg`, 12 px mono, max-h 320);
  - **intermediate messages:** `.md` at 14 / 22 in `--muted-foreground`;
  - **thinking:** a "Thought" row, italic 13 px `--faint`, expanding to its text.

While the exchange is **live**:

- Nothing folded yet stays visible: one group row carries the running count ("`6 tool
  calls`"), and **only the newest tool row** shows under it, open-ended, with its spinner. The
  streaming text below it shows with the caret.
- When the `result` arrives, the group closes with the 180 ms collapse.
- A pending permission's tool row is always visible, unfolded.
- The "Working…" shimmer stays as it is (14 px). Its label is "Thinking…" when the last block
  is thinking.

**Turn footer.** Under every finished exchange, 8 px below the answer:

- A row `min-h-7`, wrapping, gap 8 px, 12 px `--faint`. In order:
  1. **duration:** "`2m 4s`" or "`12s`", sans, `tabular-nums`;
  2. **cost:** "`$0.42`", omitted when 0 or unknown (replayed transcripts);
  3. **copy:** a ghost `size-6` `Copy` 14 px that copies the answer's markdown, then shows
     `Check` for 1.2 s; tooltip "Copy answer";
  4. **file chips.**
- A stopped exchange shows "`Stopped`" in place of duration and cost.
- No "⋯" menu: nothing to put in it.

File chips:

- Box: `h-6`, padding 0 8 px, gap 6 px, 1 px `--border`, white fill, `rounded-md`.
- Contents: a file icon 13 px `--label` (`FileCode` for code, `FileImage` for images,
  `FileText` otherwise), the name 12 px `--muted-foreground` (basename only, full path in the
  tooltip), counts 11.5 px mono `+n` `--good`, `−n` `--critical`.
- Hover: border `--line-strong`, name `--foreground`, 120 ms.
- Click: opens git mode (⌘G) on that file.
- Show at most 6, then a "`+4 files`" chip that opens git mode.
- Source: the exchange's Edit/Write/MultiEdit/NotebookEdit inputs (`file_path`), with counts
  from those inputs (Edit: lines of `old_string` / `new_string`; Write: lines of `content`).
  Deduplicate by path and sum the counts.

**Thinking (live, unfolded).** "Thinking…" shimmer as above. Once finished it lives in the
group.

**Notes** ("Model → Sonnet 5.5"): 12 px `--faint`, 4 px top margin, no box.

**Command cards** (`OutputCard`): `--chrome` fill, **no border**, `rounded-lg`, padding
12 px 16 px, 13.5 / 20 `--ink-soft`. Tables inside follow the hairline rule above. "Show all":
12 px 500 `--faint`, hover `--foreground`. Keep the fade mask.

**Errors:** `--critical-wash` fill, `--critical-ink` 13 / 20, `rounded-lg`, padding 10 px 12 px.

**The turn ruler** (new, `src/app/minimap.tsx`):

- Placement: a 16 px wide column fixed to the scroller's right edge, 8 px inside it, from 16 px
  below the top to 16 px above the bottom. Shown only when the chat overflows **and** has
  ≥ 3 user turns.
- **One tick per user turn**, top to bottom in order: 12 × 1.5 px, `rounded-full`, `--tick`,
  on an 8 px pitch. When they don't fit, the pitch shrinks to fit (minimum 3 px), then ticks
  are sampled. The ruler is top-aligned: it does not stretch to the scroller's height.
- **Current tick** (the last user turn whose top is above the viewport's 30 % line):
  `--foreground`, 16 px wide.
- Hover on a tick: `--muted-foreground`, plus a tooltip at its left with the prompt's first
  line (truncated at 60 characters).
- Click: smooth-scrolls to that user turn, 200 ms (`scrollTo` with behaviour smooth; instant
  under reduced motion).
- Colour changes animate 120 ms.

**Jump to latest:**

- When `pinned` is false (the user scrolled up more than 48 px), show a ghost `size-7` button
  with 1 px `--border`, white fill, `rounded-md`, `ChevronDown` 14 px.
- It sits **bottom left of the column**, 12 px above the composer, as Conductor puts it.
- Enter: fade + 4 px rise, 140 ms. Exit: fade, 100 ms.
- Click scrolls to the bottom and re-pins.

### 2.2 Permission card

- It sits directly above the composer, the same width, 8 px gap. White, 1 px `--line-strong`,
  `rounded-lg`, **no shadow**, padding 12 px 14 px.
- Title: `text-base` "Allow **Bash**?".
- The command: 12.5 / 20 mono in a `--chrome` box, `rounded-md`, padding 8 px 10 px, max-h 120,
  `--ink-soft`.
- Buttons: right-aligned, `h-7`, 13 px. Deny and Always allow are `secondary`; Allow is ink.
  Each ends with its shortcut as a plain glyph (the new `Kbd`): `⌘⌫`, `⇧⌘↩`, `⌘↩`.
- Enter: 200 ms rise. Dimmed to 60 % while stopping (unchanged).

### 2.3 Composer (chat)

- **Box:** `--chrome` fill, 1 px `--border`, `rounded-lg`, `--shadow-composer`, the same max
  width as the column + 32 px (`max-w-[752px]`), `mx-auto`, 16 px from the bottom.
- **Focus:** the border goes to `--line-strong`, 120 ms. **No glow, no tan.**
- **Field:**
  - 14 / 22 `--foreground`, padding 14 px 16 px 4 px, **min height 3 lines (66 px)**, grows to
    `40vh`, then scrolls;
  - placeholder `--label`, "Ask Claude, or type / for a command";
  - the whole box is about 116 px empty (Conductor: 151; we stop at three lines on purpose,
    so that a 900 px window keeps its transcript).
- **Hint:** at the top right, inside the box, 12 px `--faint`: "`⌘L to focus`". Shown only
  while the field is **not** focused. Fade 120 ms.
- **⌘L** (new shortcut, add it to CLAUDE.md's keyboard list) focuses the visible chat's
  composer from anywhere in the window. Handle it in chat-view.tsx's window key listener.
- **Toolbar:** `h-10`, padding 0 8 px 8 px, gap 4 px.
  - Left: `ModelSelect` as a ghost `h-7` button, 13 px `--muted-foreground`: "Opus 5.5" in
    `--foreground` 500, then "· High" in `--muted-foreground`, then `ChevronDown` 12 px.
    Hover `bg-hover`.
  - Right: the send button, `size-7`, ink fill, `rounded-md`, `ArrowUp` 16 px. Disabled:
    `--line-strong` fill, opaque. While working it becomes Stop: `Square` 10 px filled.
  - **Never show the branch name** (CLAUDE.md).
- **The `/` menu** floats above the composer as it does now. Restyle it per 2.7 menus.
- **Exited and read-only states:** the fill becomes white, the field is disabled, and the
  placeholder says why (unchanged copy).

### 2.4 Top bar and tab bar (`top-bar.tsx`, `tab-bar.tsx`)

- **Band:** the header's fill is `--chrome`, with `border-b --border`. It spans the chat column
  only. The sidebar's own 40 px top row stays `--sidebar`; the git head has its own band
  (2.5). All three hairlines line up at y = 40.
- **Workspace title:** `text-base` 14 px 600 `--foreground`, max 220 px, truncate (still
  hidden while the sidebar shows, per N-2). 16 px left padding.
- **Tabs:** 13 px, padding 0 12 px, gap 0.
  - Inactive: `--faint`, 400. Hover: `--muted-foreground`, 120 ms. Active: `--foreground`, 500.
  - Underline: 2 px `--tan`, inset 10 px left and right, top corners 1 px. Its scale-x
    transition stays at 220 ms.
  - **Chat tabs have no icon.** Terminal tabs keep `SquareTerminal` 14 px `--label`, which is
    the only way to tell the two kinds apart.
  - The status dot follows the title (7 px, 6 px gap).
  - The close button and the overflow `+N` are unchanged.
- **`+`:** ghost `size-7`, `Plus` 16 px `--faint`.
- **Right side:**
  - "Diff" becomes a **ghost** `h-7` button: `GitCompareArrows` 16 px + "Diff" 13 px
    `--muted-foreground`. `aria-pressed`: `bg-active` and `--foreground`. **No border.**
  - The git panel toggle: ghost `size-7`, `PanelRight` 16 px.
  - The update pill (`barButtonClass`) loses its border the same way.
- **Motion:** tabs open, close and reorder at 160 ms (table); colours 120 ms.

### 2.5 Git panel (`git-panel.tsx`, `file-list.tsx`, `setup-section.tsx`)

Default width `clamp(300px, 24vw, 420px)` (from 280 / 22vw; Conductor's is 348 pt at a
1406 pt window). The head must fit in one row at 300 px.

**Head:** exactly `h-bar`, **one row, never wraps**, padding 0 8 px 0 12 px, gap 8 px.

- **Band:** by `prHeadline().tone`:
  - `ok`: `--good-wash`;
  - `blocked`: `--critical-wash`;
  - `neutral`, or no PR: `--chrome`.
  - Bottom hairline: `color-mix(in srgb, <tone> 18%, var(--border))` on a wash, `--border`
    otherwise. The band colour cross-fades in 160 ms (status change).
- **PR chip:** a button, `h-6`, padding 0 6 px 0 8 px, `rounded-md`, 1 px
  `color-mix(<tone> 30%, transparent)` border, `bg-white/70`. Contents: "#128" 13 px 600
  **sans**, tabular, in `--good-ink`, `--critical-ink` or `--muted-foreground` by tone, then
  `ArrowUpRight` 12 px. Hover: `bg-white`.
- **Status:** an icon 14 px plus the label 14 px 500 in the tone's ink, `min-w-0 truncate`.
  Icons:
  - Ready → `CircleCheck`;
  - Checks failing, Blocked, Merge conflicts, Out of date → `CircleAlert`;
  - Checks running, Checking… → the 9 px spinner;
  - Draft → `CircleDashed`;
  - Merged → `GitMerge`;
  - Closed → `CircleSlash`.
- **No PR:** the branch name 12 px mono `--muted-foreground`, `GitBranch` 14 px, `↑n ↓n` in
  `--faint`.
- **Right cluster** (`ml-auto flex-none`):
  - Push: `secondary h-7`, "`↑ Push 2`", or `ArrowUp` + "2" only below 340 px of panel
    (C-9). Publish uses the same button.
  - Merge: `h-7`, padding 0 10 px, `bg-merge` / `hover:bg-merge-hover`, white text,
    `GitMerge` 14 + "Merge" 13 px 500.
  - Clean up: secondary.
- **Inline confirm:** replaces the right cluster **in place**. "Merge?" (or "Merge? Checks
  failing" in `--critical-ink`), then No (`secondary h-7`), then Yes (`--merge`, or
  destructive when failing). Motion: **cross-fade 120 ms with no movement** (DESIGN.md inline
  confirmations); drop the current `slide-in-from-bottom`. When the confirm doesn't fit, the
  status label truncates; the row never wraps.

**Tabs row:** `h-10`, padding 0 8 px, gap 2 px, no border under it.

- Tab: `h-7`, padding 0 10 px, `rounded-md`, 13 px.
  - Active: `bg-muted`, `--foreground`, 500.
  - Inactive: `--faint`, 400. Hover: `--muted-foreground`.
- Count: 12 px **sans** tabular `--faint`, 4 px after the label.
- Tabs: **Changes**, and **Checks** when there is a PR. Nothing else (see 3).

**Sections** (Staged, Changes):

- Header: `h-7`, padding 0 12 px, 12 px 500 `--label`, then the count 12 px `--faint`. On
  hover, "Stage all" / "Unstage all" at the right, 12 px `--faint`, hover `--foreground`.
- 8 px between sections.
- **Fold "Untracked" into "Changes"**: an untracked file is just an added file you haven't
  staged. It gets the "added" square. That is one header less of plumbing, and staging still
  works as the TUI's does.

**File row:** `h-8`, padding 0 8 px 0 12 px, gap 8 px, `rounded-md`.

- Path: the folder 13 px `--faint`, keeping the left truncation from N-1; the name 13 px
  `--foreground`. **Both sans.**
- Counts: 12 px mono tabular, `+n` `--good`, `−n` `--critical`, gap 4. "binary" 12 px
  `--faint` instead.
- **Status square, the last element**, 14 px:
  - modified → `SquareDot` `--warn`;
  - added or untracked → `SquarePlus` `--good`;
  - deleted → `SquareMinus` `--critical`;
  - renamed → `SquareArrowRight` `--faint`.
- **Remove the M/A/D letter column.**
- Hover: `bg-hover`. The row actions (discard, unstage, stage; `size-6` ghost) **replace the
  counts and the square in place**, cross-fade 120 ms.
- Selected (the file open in git mode): `bg-active`.
- Discard's two-step armed state is unchanged.

**Checks view:**

- PR title: 15 / 22 600, padding 12 px 12 px 4 px.
- Meta: 12 px `--faint` sans ("`+120 −45` · 8 files · `aimux/amber → main`", counts mono).
- Then the check rows, with no border-y: `h-8`, padding 0 12 px, gap 8 px.
  - Status icon 14 px: `CircleCheck` `--good`, `CircleX` `--critical`, spinner.
  - Name 13 px `--foreground`, truncate.
  - State 12 px `--faint` at the right ("passed", "failed", "running").
  - Hover: `bg-hover`, and `ArrowUpRight` 12 px replaces the state. Click opens `check.url`.
- Body: 13 / 20 `--muted-foreground`, max-h 260, padding 12 px.

**Bottom strip (Setup):** `h-bar`, `border-t`, padding 0 12 px. `ChevronRight` 14 px `--faint`
(rotates 90°, 180 ms), "Setup" 13 px `--muted-foreground`, and at the right the state 12 px
`--faint` with its 7 px dot. It reads as the same strip as Conductor's Run/Terminal bar,
**without** a run button or a terminal (see 3).

**Git mode file list** (`git-mode.tsx`) uses the same `Row`. It changes for free.

### 2.6 Sidebar (`sidebar.tsx`)

Default width **260 px** (from 232).

**Top row:** `h-bar`, unchanged (traffic lights, then the sidebar toggle).

**Nav:**

- Three rows: New workspace, Inbox, Search. `h-8`, padding 0 10 px, gap 10 px, 13 px
  `--muted-foreground`, icon 16 px `--faint`.
- **No key caps.** Shortcuts live in tooltips ("New workspace · ⌘N", "Search · ⌘P").
- Inbox counts: `text-2xs` badges, unchanged, colours from `--warn-ink` and the tokens.
- The hairline under the nav stays.

**Project groups:**

- **The header becomes a section label**, not a row with an avatar: `h-7`, padding 0 12 px,
  16 px top margin (8 px for the first), 12 px 500 `--label`. Hover shows the collapse chevron,
  `···` and `+` at the right, as now.
- Clicking selects the project (`here` gives `bg-active`), as now.
- **Drop the coloured avatar from the sidebar.** It stays in ⌘P and the composer. The
  sidebar's colour belongs to workspaces.

**Workspace row**, the recommended layout (**option A below**):

- Box: `h-12` (48 px), 2 px gap, `rounded-md`, padding 0 8 px 0 12 px.
- **Colour bar:** 3 × 16 px, `rounded-full`, at the row's left (x = 4 px inside the row),
  filled with `COLORS[colour of ws.branch]`. Use `src/model/names.ts` on the **branch**, so
  that a renamed workspace keeps its colour. Add `box-shadow: inset 0 0 0 0.5px rgb(0 0 0 /
  0.12)` so that pale colours (alabaster, buttermilk) still show.
- **Line 1:** `ws.name`, 13 px. Read: 400 `--muted-foreground`. Unread (`signal === 'done'`,
  not yet seen): **600 `--foreground`**. Selected: 500 `--foreground`.
- **Line 2:** the task title, 12 px `--faint`, truncate. The task title is the first chat
  title that isn't "New chat", or the composer's prompt. With none, line 2 is omitted and the
  row becomes 36 px.
- **Right slot**, top-aligned with line 1, 12 px `--faint` tabular. Exactly one of:
  - the waiting dot (amber, breathing);
  - the working spinner (9 px);
  - the **age** of the last activity: "now", "4m", "3h", "2d", "5w". Refresh it every 60 s.
- **Removed from the row:** the `GitBranch` icon and the `+n −n` counts (both live in the git
  panel; the counts go into the row's tooltip, "`+268 −233` · `aimux/amber`").
- **Hover:** `bg-hover`, 120 ms. The `···` button appears over the right slot on a fade (as
  the project row does today).
- **Selected:** `bg-active`.
- **Rename in place** (double-click, or Rename in the menu): line 1 becomes the shared
  `RenameField`, 13 px, the same height. Line 2 stays.
- ⌘1–9 badges: none in the row. The number shows in the tooltip.

**Foot:** `h-bar` (from `h-11`), `border-t`. The quota chip loses its border (PM-7): 12 px
`--faint`, with a 6 px dot. Settings: ghost `size-7`.

**New data the row needs:**

- `activeAt` on `ChatRecord` (ms). Set it when a user turn is sent and when a `result`
  arrives, in `use-chats.ts`, and persist it (`src-tauri/src/store.rs`,
  `#[serde(default)] active_at: u64`).
- A workspace's age is the max over its chats, with a fallback to `createdAt`.
- The task title is derived in `app.tsx` from the catalog's chats.

### 2.7 ⌘P, menus, popovers, the ⌘N dialog

**Menus** (`components/ui/menu.tsx`, `context-menu.tsx`, `lib/menu-styles.ts`):

- Popup: white, `rounded-xl`, `--shadow-popover`, padding 4 px, min-width 200.
- Item: `h-7`, padding 0 8 px, `rounded-md`, 13 px, gap 8 px. Icon 14 px `--faint`, going to
  `--foreground` on highlight. The shortcut at the right as a plain glyph, 12 px `--faint`.
  Highlight: `bg-accent`.
- Separator: 1 px `--border`, margin 4 px −4 px. Destructive items: `--critical-ink`.
- Group labels: 12 px 500 `--label`, `h-6`, padding 0 8 px.
- Motion: enter 150 ms fade + 3 px slide from the anchor + scale 0.98 → 1; exit 110 ms fade.

**⌘P** (`picker.tsx`):

- Box: width 640, `rounded-xl`, `--shadow-popover`, **no veil**. Top at 18 % of the window
  height.
- Input row: `h-12`, padding 0 16 px, `Search` 16 px `--faint`, 15 px text, `border-b`.
- Group labels (N-4): 12 px 500 `--label`, `h-7`, padding 0 16 px.
- Rows: inset 6 px, `rounded-md`, padding 0 10 px, gap 10 px.
  - One line: `h-9`. Two lines: `h-12`.
  - Leading icon 16 px `--faint`. For a workspace, the **colour bar** (3 × 14 px) replaces
    `GitBranch`, the same identity as the sidebar. Projects keep their 18 px avatar.
  - Title 14 px `--foreground`. Subtitle 12 px `--faint`.
  - Meta at the right ("current", "2 workspaces") 12 px `--faint`.
  - Selected: `bg-accent`.
- **Drop the 1–7 row numbers** in the left gutter. ⌘P is typed into, not numbered.
- Footer legend: `h-9`, 12 px `--faint`, the only boxed key caps in the app.
- Motion: 160 ms fade + 4 px drop + scale 0.98 → 1; exit 110 ms fade.

**Popovers** (the model and Intelligence popover, `agent-select.tsx`; the inbox):

- Menu styling: rows `h-8` with name 13 px 500 and description 12 px `--faint` in one line;
  check 14 px at the right.
- The Intelligence slider block: padding 12 px, label 13 px 500, value 13 px
  `--muted-foreground`, stop labels 12 px `--faint` (active `--foreground` 500), hint "`⇧⌘/`
  steps through it" with a plain glyph.

**⌘N composer dialog** (`new-workspace.tsx`): it is the composer, so it uses the composer's
language.

- Box: width 680, white, `rounded-xl`, `--shadow-dialog`.
- Veil: `rgb(40 39 37 / 0.08)`. Today's grey wash is too heavy.
- Header row: `h-12`, the project chip and the base-branch combo (13 px), `border-b`.
- Prompt: 15 / 24, padding 16 px, min 4 lines.
- Toolbar: `h-12`, the model chip on the left, "⇧↩ new line" 12 px `--faint` and **Create**
  (ink `h-7`, `↩` as a glyph) on the right.
- Motion: 180 ms fade + 6 px rise; the veil fades.

### 2.8 Empty states

All centred in their pane. A title in `text-lg` or 13 px, a 13–14 px `--faint` line under it,
and the keyboard path. No illustrations.

| Surface                          | Spec                                                                                                                                                                                                                                     |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New chat                         | at 30 % of the pane height: "What are we doing in amber?" `text-lg` 20 / 28 600; under it, 14 px `--faint`: "Claude Code, in this workspace's folder. Enter sends, Esc stops." **Drop the MessageCircle icon.** The composer gets focus. |
| Workspace with no tab            | the same title, and the composer inline (Run B)                                                                                                                                                                                          |
| Project selected (main checkout) | "aimux-desktop" `text-lg`; under it "Every piece of work gets its own worktree."; then a secondary `h-8` button "New workspace ⌘N"                                                                                                       |
| Git: clean                       | 96 px from the top: `CircleCheck` 20 px `--label`, then "Working tree clean" 13 px `--faint`                                                                                                                                             |
| Git: not a repository            | the same layout, `FolderX` 20 px, "Not a git repository"                                                                                                                                                                                 |
| Checks: none                     | "No checks on this pull request", 13 px `--faint`, padding 24 px                                                                                                                                                                         |
| ⌘P: no match                     | one `h-12` row: "No match for “xyz”", 13 px `--faint`                                                                                                                                                                                    |
| Sidebar: no project              | under the "Projects" label: a ghost `h-8` row, "Open a folder…", with `FolderOpen` 16 px                                                                                                                                                 |

### 2.9 States, everywhere

| State                                               | Treatment                                                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Hover (rows)                                        | `bg-hover` `#f4f4f3`, 120 ms ease-out, colour only                                         |
| Hover (text-only controls: group rows, tabs, chips) | ink one step darker, 120 ms; no fill                                                       |
| Pressed                                             | buttons `scale-[0.96]` (existing); rows none                                               |
| Selected, current                                   | `bg-active` `#efefee`; text `--foreground` 500                                             |
| Focus                                               | `focus-visible` only: a 2 px `--ring` outline, −2 px offset (existing)                     |
| Disabled                                            | 45 % opacity, with a tooltip that says why                                                 |
| Unread                                              | weight 600 `--foreground` (sidebar). No dot for "done" in the sidebar: the weight says it. |
| Waiting                                             | amber dot, breathing (existing). Working: spinner. Failing: red dot. The same everywhere.  |

---

## 3. What must not change, and the compliant version of each Conductor pattern

**Unchanged by this pass:**

- Standalone; no daemon.
- Two tab kinds, Chat and Terminal.
- Everything is a worktree.
- One composer dialog.
- Models from `initialize`.
- The Intelligence slider and ⇧⌘/.
- No commit box, no "create PR".
- No modal for quick things.
- Chats survive a restart.
- Quotas every 180 s or more.
- Keyboard map: ⌘N, ⌘T, ⇧⌘T, ⌘W twice, ⌘P, ⌘1–9 (workspaces), ⌃1–9 (tabs), ⌘B, ⌥⌘B, ⌘G.
- Light only.
- System font.
- No TCP.
- Buttons call real host commands.

**Conflicts, and the compliant version:**

- **Sidebar titles vs. colour names.** Conductor names a workspace after its task. Ours are
  colours (`aimux/amber`), renamable in place, sayable ("switch to teal"), and ⌘1–9 numbers
  them. Every option below keeps the colour as the workspace's name and identity. The
  **colour bar** is our version of Conductor's accent bar: it gives the colour a visual form,
  so the word doesn't have to carry the identity alone. The CTO should mock both.

  **Option A (recommended, specified in 2.6): colour name primary, task title as a faint
  subtitle.**

  ```
  ▌ amber                          3h      48 px row
  ▌ Port the menus to Base UI
  ▌ teal                           ◐       (working)
  ▌ Fix the resume picker order
  ▌ violet                         2d
  ```

  The name stays the handle you say and rename. The subtitle answers "what was that one?"
  without opening it. Cost: 48 px rows, so about 30 % fewer rows per screen than Conductor.

  **Option B: task title primary, colour as a small detail.**

  ```
  ▌ Port the menus to Base UI   amber · 3h      36 px row
  ▌ Fix the resume picker order  teal · ◐
  ▌ Draft the release notes    violet · 2d
  ```

  - Line: the task title 13 px (unread 600 `--foreground`, read 400 `--muted-foreground`).
  - At the right: the colour name 12 px `--faint`, then " · ", then the age or the status.
  - Below 240 px of sidebar, the colour word is dropped and only the bar remains.
  - A workspace the user has **renamed** shows its given name as the title (a chosen name
    outranks a derived one). Rename in place edits that line.
  - With no chat yet, the title is the colour name itself.

  This is closest to Conductor's density and look, but it demotes the owner's naming decision
  to a detail. **The owner's call**, which is why it is an option and not the default.

- **Conductor's "All files" tab: no.** It is a file browser, not git, and we have no file
  viewer outside the diff. Adding one is a feature, not a design pass. ⌘P could search files
  later if the owner asks.
- **"Review" tab: no.** It implies review comments we don't have.
- **Our tabs, mapped:** Conductor's **Changes** = our **Changes** (with Staged above it,
  because stage and unstage are the TUI's). Conductor's **Checks** = our **Checks**.
- **Run / Terminal area in the git panel: no.** Terminal tabs already exist (⇧⌘T) in the main
  area, so a second terminal surface would duplicate them, and "Run" needs a run-script
  concept we don't have. The **Setup strip** keeps the same position and look (a 40 px bar at
  the bottom of the panel with a top hairline), because it maps to our setup script.
- **Composer extras: no.** Conductor's `+` (attachments) and mode icons map to nothing we
  have. They stay out. The branch name never appears in the composer.
- **The turn footer's `⋯`: no.** There is nothing to put in it. The footer is duration, cost
  (owner: Claude Code's estimate), copy, and file chips.
- **Pinned, Team, Home, avatars, back and forward arrows: no.**
- **Conductor's pencil marks on tabs: no.** We have status dots.
- **⌘L to focus: new.** It is the only addition to the keyboard map. Tell the owner, and add
  it to CLAUDE.md's list when it ships.
- **The project avatar:** kept in ⌘P and the composer, removed from the sidebar. That is a
  presentation change, not a product decision.

---

## 4. Build order

Five chunks, split by file ownership. **A goes first** and is small (half a day). It only adds
or renames tokens and primitives, and B–E only reference the names defined in 2.0. B to E run
in parallel. All of them land on top of the in-flight round-2 runs. Every chunk:

- runs `bun run lint && bun run format && bun test && (cd src-tauri && cargo test)`;
- screenshots the browser preview at 1000 × 600 and 1440 × 900 (`AIMUX_PROFILE=gui-dev` for
  the app);
- says plainly what it could not check in the running app.

### A. Foundations and floating surfaces

**Files:**

- `src/styles.css` (tokens, the type scale, `.md`, removing the scrollbar rules);
- `DESIGN.md` (the Tokens section: type table, colour table, radii, row heights);
- `src/components/ui/{kbd,button,menu,context-menu,popover,dialog,tooltip}.tsx`;
- `src/lib/menu-styles.ts`;
- `src/app/{picker,new-workspace,inbox,resume-picker,context-menu,command-menu}.tsx`;
- `src/dev/gallery.tsx`.

**Work:**

- every token in 2.0;
- the plain-glyph `Kbd`;
- menus, ⌘P, the ⌘N dialog and the inbox per 2.7;
- the `/` menu's styling (its placement stays with C);
- replace every raw hex in these files with tokens.

**Acceptance (screenshots):**

- ⌘P with groups, colour bars in workspace rows, no row numbers, no veil;
- a right-click menu with 28 px rows and glyph shortcuts;
- the ⌘N dialog with its light veil;
- `rg '#[0-9a-f]{6}' src/app src/components` returns only `names.ts`, `AVATAR_TONES` and the
  terminal theme;
- the chat scrollbar hides when idle in the app build.

### B. Transcript (the chat's content)

**Files:**

- `src/chat/model.ts` + `model.test.ts`: exchange grouping, per-exchange end (duration, cost,
  stopped; replay takes the duration from transcript timestamps, the cost as unknown), changed
  files with counts;
- **new** `src/app/transcript.tsx`: `Transcript`, `BlockView`, `ToolBody`, `ToolGroup`,
  `TurnFooter`, `UserTurn`, `OutputCard`;
- **new** `src/app/minimap.tsx`.

**First step, before anything else:** a pure move of the transcript components out of
`chat-view.tsx` into `transcript.tsx`, with no visual change, landed within the hour, so that
C owns `chat-view.tsx` from then on.

**Work:** 2.1 entirely (prose, bubble, grouping, footer, cards, notes, errors, ruler, jump to
latest).

**Tests:**

- the collapse rule: answer-last, answer-first-then-tools, tools-only, live;
- pluralisation;
- changed files from Edit, Write and MultiEdit;
- duration formatting.

**Acceptance:**

- a long fixture chat at 1440 shows each finished exchange as at most "group row, answer,
  footer";
- a group expanded shows tool rows indented under the label;
- footer chips wrap at 1000 px;
- the ruler shows one tick per prompt, the current one in ink;
- scrolled up, the ↓ button appears bottom left;
- prose measures 15 / 24 (in the inspector);
- the user bubble is 44 px for one line, `#f7f6f4`;
- no command card has a border.

### C. Composer and permission card

**Files:** `src/app/chat-view.tsx` (after B's move), `src/app/agent-select.tsx`. The `/` menu
placement stays here; its styling is A's.

**Work:**

- 2.3 entirely: box, field, hint, ⌘L, toolbar, send and stop;
- 2.2: the permission card;
- the model popover per 2.7.

**Acceptance:**

- the empty composer is about 116 px tall, `#fafaf9`, hairline, soft shadow;
- focused: a `#dddbd9` border and **no tan glow**;
- "⌘L to focus" visible only while unfocused, and ⌘L from the git panel focuses the field;
- a permission card with plain glyph shortcuts and no shadow;
- the 1000 × 600 window still shows at least 6 transcript lines above the composer.

### D. Shell (sidebar, top bar, tab bar)

**Files:**

- `src/app/{sidebar,top-bar,tab-bar,status-dot,quotas}.tsx`;
- `src/app.tsx` (sidebar props: task titles, ages; widths);
- `src/app/use-layout.ts` (sidebar 260, git `clamp(300px,24vw,420px)`);
- `src/app/use-chats.ts` (`activeAt`);
- `src/model/catalog.ts` + test (age and task-title helpers);
- `src-tauri/src/store.rs` (`active_at`, serde default);
- `src/model/names.ts` (read only).

**Work:** 2.4 and 2.6, with **option A** built and **option B behind a dev-only switch** in the
browser preview (`src/dev/fixtures.ts`, owned here), so the CTO can screenshot both for the
owner. The switch is deleted after the owner picks.

**Tests:**

- age formatting (now, m, h, d, w);
- task title derivation (skips "New chat");
- `activeAt` survives a store round trip (cargo test).

**Acceptance:**

- the sidebar at 1440 shows section-label project headers with no avatars;
- workspace rows with colour bars, a faint subtitle and ages; one unread row in bold;
- no branch icons or diff counts;
- nav with no key caps;
- the top bar as a `#fafaf9` band; chat tabs with no icons; the terminal tab with its icon;
- "Diff" without a border;
- the hairlines of sidebar, top bar and git head line up at y = 40;
- the option B screenshot taken from the same fixture.

### E. Git panel

**Files:** `src/app/{git-panel,file-list,setup-section,git-mode}.tsx`, `src/app/file-list.test.ts`,
`src/git/pr.ts` (the status icon per headline, if a mapping helper helps).

**Work:** 2.5 entirely.

**Tests:** Untracked folded into Changes (ordering in `listOrder`), and the headline → icon
mapping.

**Acceptance:**

- at 1440 with the default width, the head is **one 40 px row**:
  `#128 ↗ ⚠ Checks failing … ↑ Push 2  Merge`, on a pale red band;
- the "ready" fixture shows a pale green band;
- the merge confirm cross-fades in place with no movement;
- at 1000 × 600 Push is icon-only, and nothing wraps;
- file rows are 32 px with sans names, grey folders, mono counts and a coloured square at the
  far right; no M/A/D letters;
- hovering a row swaps counts for actions in place;
- the Checks tab has 32 px rows with icons, and hover shows ↗;
- the Setup strip is a 40 px bar.

### Order of review

A, then B, C, D and E as they land. One owner review at the end with:

- the four main screenshots: `01-main`, `19-long-indigo`, `30-composer`, `13-cmdp`, re-shot;
- the two sidebar options side by side.

Ask the owner two questions: option A or B, and ⌘L.
