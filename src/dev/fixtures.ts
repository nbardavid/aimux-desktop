// What the browser preview shows: two projects, three workspaces, chats that draw every
// block kind, a terminal, git changes with a PR, quotas. Dev only (see mock-ipc.ts).

import type { Catalog } from '../model/catalog'

import { claudeSnapshot, type QuotaCache } from '../model/quota'
import INIT from './claude-init.json'

const MIN = 60_000
const HOUR = 60 * MIN
const now = Date.now()

const HOME = '/Users/dev'
const TREES = `${HOME}/.aimux/worktrees`
export const PATHS = {
  amber: `${TREES}/aimux-desktop/amber`,
  main: `${HOME}/dev/aimux-desktop`,
  pragma: `${HOME}/dev/pragma-once`,
  teal: `${TREES}/aimux-desktop/teal`,
  violet: `${TREES}/pragma-once/violet`,
}

export const INIT_ANSWER = INIT

export function catalog(): Catalog {
  return {
    chats: [
      {
        createdAt: now - 3 * HOUR,
        effort: 'high',
        id: 'chat-menus',
        model: 'opus',
        sessionId: 'session-menus',
        title: 'Port the menus to Base UI',
        workspaceId: 'ws-amber',
      },
      {
        createdAt: now - 2 * HOUR,
        effort: '',
        id: 'chat-resume',
        model: '',
        sessionId: 'session-resume',
        title: 'Fix the resume picker order',
        workspaceId: 'ws-amber',
      },
      {
        createdAt: now - HOUR,
        effort: 'medium',
        id: 'chat-notes',
        model: 'sonnet',
        sessionId: 'session-notes',
        title: 'Write the release notes',
        workspaceId: 'ws-teal',
      },
    ],
    projects: [
      { id: 'p-aimux', lastOpenedAt: now, name: 'aimux-desktop', path: PATHS.main },
      { id: 'p-pragma', lastOpenedAt: now - HOUR, name: 'pragma-once', path: PATHS.pragma },
    ],
    workspaces: [
      {
        base: 'origin/main',
        branch: 'aimux/amber',
        createdAt: now - 5 * HOUR,
        id: 'ws-amber',
        name: 'amber',
        path: PATHS.amber,
        projectId: 'p-aimux',
        setup: { exitCode: 0, ranAt: now - 5 * HOUR },
      },
      {
        base: 'origin/main',
        branch: 'aimux/teal',
        createdAt: now - 4 * HOUR,
        id: 'ws-teal',
        name: 'teal',
        path: PATHS.teal,
        projectId: 'p-aimux',
        setup: { exitCode: 1, ranAt: now - 4 * HOUR },
      },
      {
        base: 'origin/main',
        branch: 'aimux/violet',
        createdAt: now - 26 * HOUR,
        id: 'ws-violet',
        name: 'violet',
        path: PATHS.violet,
        projectId: 'p-pragma',
        setup: null,
      },
    ],
  }
}

export const HOST_STATUS = {
  list: {
    chats: [
      { alive: true, historyLen: 0, id: 'chat-menus', unread: false, waiting: true, working: true },
      {
        alive: true,
        historyLen: 0,
        id: 'chat-notes',
        unread: true,
        waiting: false,
        working: false,
      },
    ],
    terms: [
      {
        code: null,
        command: null,
        cwd: PATHS.amber,
        ended: false,
        id: 'term-amber',
        tag: null,
        title: 'Terminal',
        workspaceId: 'ws-amber',
      },
    ],
  },
  protocolOk: true,
}

// Lines of Claude Code's stream-json, as the host replays them on `chat_open`.

const line = (value: unknown) => JSON.stringify(value)
const sent = (uuid: string, text: string) =>
  line({
    message: { message: { content: [{ text, type: 'text' }], role: 'user' }, type: 'user', uuid },
    type: 'aimux_sent',
  })
const assistant = (id: string, content: unknown[], model = 'claude-opus-5-5') =>
  line({ message: { content, id, model, role: 'assistant' }, type: 'assistant' })
const toolResult = (id: string, content: string, isError = false) =>
  line({
    message: {
      content: [{ content, is_error: isError, tool_use_id: id, type: 'tool_result' }],
      role: 'user',
    },
    type: 'user',
  })
const result = (cost: number, ms: number) =>
  line({
    duration_ms: ms,
    is_error: false,
    subtype: 'success',
    total_cost_usd: cost,
    type: 'result',
  })
const initAnswer = (id: string) =>
  line({
    response: { request_id: `init-${id}`, response: INIT, subtype: 'success' },
    type: 'control_response',
  })
const systemInit = (session: string, model: string) =>
  line({ model, session_id: session, subtype: 'init', type: 'system' })
export const LIVE = line({ type: 'aimux_live' })

const ANSWER = `The context menu re-implements focus and placement by hand, which is why a row could
lose its highlight under a still mouse. Base UI's \`Menu\` handles both:

\`\`\`tsx
<ContextMenu>
  <ContextMenuTrigger render={<div className="row" />} />
  <ContextMenuContent>
    <ContextMenuItem onClick={reveal}>Show in Finder</ContextMenuItem>
    <ContextMenuSeparator />
    <ContextMenuItem variant="destructive">Delete workspace…</ContextMenuItem>
  </ContextMenuContent>
</ContextMenu>
\`\`\`

What changes:

1. **Keyboard**: arrows, Home/End and type-ahead come for free.
2. **Placement**: the popup flips at the window edge instead of being clipped.
3. The inline confirmation stays: *no modal for anything quick*.

| File | Before | After |
|------|-------:|------:|
| \`context-menu.tsx\` | 125 | 48 |
| \`picker.tsx\` | 141 | 62 |

See [Base UI's menu docs](https://base-ui.com/react/components/menu) for the parts.`

const CONTEXT_OUTPUT = `## Context Usage

**Model:** claude-opus-5-5
**Tokens:** 18.8k / 1m (2%)

### Estimated usage by category

| Category | Tokens | Percentage |
|----------|--------|------------|
| System prompt | 2.5k | 0.3% |
| System tools | 2.3k | 0.2% |
| MCP tools | 631 | 0.1% |
| MCP server instructions | 1.6k | 0.2% |
| MCP tools (deferred) | 57.8k | 5.8% |
| System tools (deferred) | 14.6k | 1.5% |
| Custom agents | 239 | 0.0% |
| Memory files | 62 | 0.0% |
| Skills | 8.3k | 0.8% |
| Messages | 3.2k | 0.3% |
| Free space | 948.2k | 94.8% |
| Autocompact buffer | 33k | 3.3% |

### MCP Tools

| Tool | Server | Tokens |
|------|--------|--------|
| mcp__chrome-devtools__click | chrome-devtools | 253 |
| mcp__chrome-devtools__close_page | chrome-devtools | 152 |
| mcp__chrome-devtools__take_screenshot | chrome-devtools | 466 |`

/** A chat the host runs: every block kind, ending on a permission it waits for. */
const MENUS = [
  initAnswer('chat-menus'),
  systemInit('session-menus', 'claude-opus-5-5'),
  sent('u-menus-1', 'Why does the context menu lose its hovered row when the mouse stays still?'),
  assistant('m-menus-1', [
    {
      thinking:
        'The row highlight is driven by mouseenter only. When the list re-renders under a still pointer, no mouseenter fires, so the active index resets. Check context-menu.tsx and pointer.ts.',
      type: 'thinking',
    },
    { text: 'Let me look at how the menu tracks the hovered row.', type: 'text' },
    {
      id: 'tool-read',
      input: { file_path: `${PATHS.amber}/src/app/context-menu.tsx` },
      name: 'Read',
      type: 'tool_use',
    },
    {
      id: 'tool-grep',
      input: { command: 'rg -n "onMouseEnter" src/app --type tsx' },
      name: 'Bash',
      type: 'tool_use',
    },
  ]),
  toolResult(
    'tool-read',
    '1\timport { useEffect, useRef, useState } from "react"\n2\t\n3\texport interface MenuState {\n4\t  items: MenuItem[]\n5\t  x: number\n6\t  y: number\n7\t}'
  ),
  toolResult('tool-grep', 'rg: unrecognized file type: tsx\nexit code 2', true),
  assistant('m-menus-2', [
    { text: ANSWER, type: 'text' },
    {
      id: 'tool-edit',
      input: {
        file_path: `${PATHS.amber}/src/app/pointer.ts`,
        new_string:
          'export const moved = (a: Point, b: Point) =>\n  Math.hypot(a.x - b.x, a.y - b.y) > 2',
        old_string: 'export const moved = (a: Point, b: Point) => a.x !== b.x || a.y !== b.y',
      },
      name: 'Edit',
      type: 'tool_use',
    },
  ]),
  toolResult('tool-edit', 'The file src/app/pointer.ts has been updated.'),
  result(0.4231, 61_000),
  sent('u-menus-2', '/context'),
  assistant('m-menus-3', [{ text: CONTEXT_OUTPUT, type: 'text' }], '<synthetic>'),
  result(0, 120),
  sent('u-menus-3', 'Now run the tests and fix what fails.'),
  assistant('m-menus-4', [
    { text: 'Running the unit tests first.', type: 'text' },
    {
      id: 'tool-test',
      input: { command: 'bun test src', description: 'Run the unit tests' },
      name: 'Bash',
      type: 'tool_use',
    },
  ]),
  line({
    request: {
      description: 'Run the unit tests',
      input: { command: 'bun test src', description: 'Run the unit tests' },
      permission_suggestions: [
        {
          behavior: 'allow',
          destination: 'localSettings',
          rules: [{ ruleContent: 'bun test:*', toolName: 'Bash' }],
          type: 'addRules',
        },
      ],
      subtype: 'can_use_tool',
      tool_name: 'Bash',
    },
    request_id: 'perm-tests',
    type: 'control_request',
  }),
  LIVE,
]

/** A chat that finished while nobody looked: `done` in the sidebar and the inbox. */
const NOTES = [
  initAnswer('chat-notes'),
  systemInit('session-notes', 'claude-sonnet-5-5'),
  sent('u-notes-1', 'Draft the release notes for 0.2 from the merged PRs.'),
  assistant('m-notes-1', [
    {
      text: '## aimux 0.2\n\n- Slash commands with a `/` menu and command cards\n- `/resume` across the whole project\n- Self-updating releases\n\nWant me to open a PR with these in `CHANGELOG.md`?',
      type: 'text',
    },
  ]),
  result(0.0812, 14_000),
  LIVE,
]

export const HOSTED_LINES: Record<string, string[]> = {
  'chat-menus': MENUS,
  'chat-notes': NOTES,
}

/** `chat_history` of the sleeping chat: Claude Code's transcript format, one block per line. */
export const TRANSCRIPTS: Record<string, string[]> = {
  'session-resume': [
    line({
      message: {
        content: 'Sessions from this workspace should come first in /resume.',
        role: 'user',
      },
      type: 'user',
      uuid: 't-1',
    }),
    line({
      message: {
        content: [{ text: 'I will find where the list is ordered.', type: 'text' }],
        id: 'm-r-1',
      },
      type: 'assistant',
    }),
    line({
      message: {
        content: [
          {
            id: 'tool-r-grep',
            input: { pattern: 'orderSessions' },
            name: 'Grep',
            type: 'tool_use',
          },
        ],
        id: 'm-r-1',
      },
      type: 'assistant',
    }),
    line({
      message: {
        content: [
          {
            content: 'src/app/resume.ts:58:export function orderSessions(',
            tool_use_id: 'tool-r-grep',
            type: 'tool_result',
          },
        ],
        role: 'user',
      },
      type: 'user',
      uuid: 't-2',
    }),
    line({
      message: {
        content: [
          {
            text: 'Done: `orderSessions` now sorts by *here first*, then newest. The test in `resume.test.ts` covers both.',
            type: 'text',
          },
        ],
        id: 'm-r-2',
      },
      type: 'assistant',
    }),
    line({
      content: '<command-name>/model</command-name>\n<command-args>sonnet</command-args>',
      subtype: 'local_command',
      type: 'system',
      uuid: 't-3',
    }),
    line({
      content: '<local-command-stdout>Set model to Sonnet 5.5</local-command-stdout>',
      subtype: 'local_command',
      type: 'system',
      uuid: 't-4',
    }),
  ],
}

/** What a fresh chat's Claude says when the window writes to it. */
export const reply = (text: string) => [
  assistant(`m-${crypto.randomUUID()}`, [
    {
      text: `(Preview) No Claude runs in the browser; this stands in for the answer to “${text}”.`,
      type: 'text',
    },
  ]),
  result(0.0012, 900),
]

export const freshChat = (chatId: string) => [
  initAnswer(chatId),
  systemInit(`session-${chatId}`, 'claude-opus-5-5'),
]

// Git.

const change = (
  path: string,
  status: string,
  staged: boolean,
  add: number | null,
  del: number | null
) => ({
  add,
  del,
  path,
  staged,
  status,
  unstaged: !staged,
  untracked: false,
})

export const GIT_STATUS: Record<string, unknown[]> = {
  [PATHS.amber]: [
    change('src/app/context-menu.tsx', 'M', true, 48, 91),
    change('src/app/picker.tsx', 'M', false, 22, 63),
    change('src/components/ui/menu.tsx', 'A', true, 186, 0),
    change('src/app/icons.tsx', 'D', false, 0, 79),
    {
      add: 12,
      del: null,
      path: 'docs/notes/menus.md',
      staged: false,
      status: 'A',
      unstaged: false,
      untracked: true,
    },
  ],
  [PATHS.teal]: [change('CHANGELOG.md', 'M', false, 18, 2)],
  [PATHS.violet]: [],
}

export const GIT_BRANCH: Record<string, unknown> = {
  [PATHS.amber]: { ahead: 2, behind: 0, branch: 'aimux/amber', remote: true, upstream: true },
  [PATHS.teal]: { ahead: 1, behind: 0, branch: 'aimux/teal', remote: true, upstream: false },
  [PATHS.violet]: { ahead: 0, behind: 0, branch: 'aimux/violet', remote: true, upstream: true },
}

/** `gh pr view --json …`, raw. */
export const PRS: Record<string, unknown> = {
  [PATHS.amber]: {
    additions: 412,
    baseRefName: 'main',
    body: 'Menus, pickers and combos on Base UI.',
    changedFiles: 14,
    deletions: 268,
    headRefName: 'aimux/amber',
    isDraft: false,
    mergeable: 'MERGEABLE',
    mergeStateStatus: 'UNSTABLE',
    number: 128,
    state: 'OPEN',
    statusCheckRollup: [
      { conclusion: 'SUCCESS', name: 'lint', status: 'COMPLETED' },
      { conclusion: 'SUCCESS', name: 'test', status: 'COMPLETED' },
      { conclusion: 'FAILURE', name: 'build (macos-14)', status: 'COMPLETED' },
      { context: 'cargo test', state: 'SUCCESS' },
    ],
    title: 'Port menus and pickers to Base UI',
    url: 'https://github.com/nbardavid/aimux-desktop/pull/128',
  },
  [PATHS.violet]: {
    additions: 40,
    baseRefName: 'main',
    body: '',
    changedFiles: 3,
    deletions: 12,
    headRefName: 'aimux/violet',
    isDraft: false,
    mergeable: 'MERGEABLE',
    mergeStateStatus: 'CLEAN',
    number: 57,
    state: 'MERGED',
    statusCheckRollup: [{ conclusion: 'SUCCESS', name: 'ci' }],
    title: 'Stat tiles in the dashboard',
    url: 'https://github.com/nbardavid/pragma-once/pull/57',
  },
}

export const DIFF = `diff --git a/src/app/context-menu.tsx b/src/app/context-menu.tsx
index 3b1c2d4..9f8e7a6 100644
--- a/src/app/context-menu.tsx
+++ b/src/app/context-menu.tsx
@@ -1,12 +1,9 @@
-import { useEffect, useRef, useState } from 'react'
+import { ContextMenu as Menu } from '@base-ui/react/context-menu'

 export interface MenuState {
   items: MenuItem[]
   x: number
   y: number
 }
-
-const PAD = 8
-const clamp = (v: number, max: number) => Math.min(Math.max(v, PAD), max - PAD)
+// Base UI places the popup and flips it at the window edge.

 export function ContextMenu({ menu, onClose }: Props) {
@@ -40,7 +37,6 @@ export function ContextMenu({ menu, onClose }: Props) {
   const [hot, setHot] = useState(0)
-  const [armed, setArmed] = useState<number | null>(null)
   return (
     <div className="dialog menu" role="menu">
`

export const BRANCHES = {
  branches: [
    'main',
    'develop',
    'release/0.2',
    'aimux/amber',
    'aimux/teal',
    'feat/dark-mode',
    'fix/resume-order',
  ],
  default: 'main',
}

export const SESSIONS = [
  {
    cwd: PATHS.amber,
    firstPrompt: 'Why does the context menu lose its hovered row when the mouse stays still?',
    id: 'session-menus',
    sizeBytes: 482_000,
    title: 'Port the menus to Base UI',
    updatedAt: now - 4 * MIN,
  },
  {
    cwd: PATHS.amber,
    firstPrompt: 'Sessions from this workspace should come first in /resume.',
    id: 'session-resume',
    sizeBytes: 96_000,
    title: '',
    updatedAt: now - 2 * HOUR,
  },
  {
    cwd: PATHS.teal,
    firstPrompt: 'Draft the release notes for 0.2 from the merged PRs.',
    id: 'session-notes',
    sizeBytes: 31_000,
    title: 'Write the release notes',
    updatedAt: now - HOUR,
  },
  {
    cwd: PATHS.main,
    firstPrompt: 'Set up the bump script so `bun bump patch` tags and releases.',
    id: 'session-bump',
    sizeBytes: 2_400_000,
    title: 'Release script',
    updatedAt: now - 3 * 24 * HOUR,
  },
  {
    cwd: `${TREES}/aimux-desktop/crimson`,
    firstPrompt: 'Make the quota bars warn at 60% and go red at 85%.',
    id: 'session-quotas',
    sizeBytes: 140_000,
    title: '',
    updatedAt: now - 6 * 24 * HOUR,
  },
  {
    cwd: PATHS.main,
    firstPrompt: 'Name a workspace for the user request: fix the tabs',
    id: 'session-naming',
    sizeBytes: 2000,
    title: '',
    updatedAt: now - 5 * MIN,
  },
]

export function quotaCache(): QuotaCache {
  const at = Date.now()
  const iso = (ms: number) => new Date(at + ms).toISOString()
  return {
    claude: {
      fetchedAt: at,
      snapshot: claudeSnapshot(
        {
          five_hour: { resets_at: iso(2 * HOUR + 14 * MIN), utilization: 42 },
          seven_day: { resets_at: iso(2 * 24 * HOUR + 3 * HOUR), utilization: 71 },
          seven_day_opus: { resets_at: iso(2 * 24 * HOUR + 3 * HOUR), utilization: 88 },
        },
        at
      ),
    },
  }
}

export const SETTINGS = {
  path: `${HOME}/Library/Application Support/aimux/settings.json`,
  settings: { 'git.fetchBase': false },
}

const ESC = '\u001B['
export const TERMINAL_PROMPT = `${ESC}1;32m➜${ESC}0m  ${ESC}1;36maimux-desktop${ESC}0m ${ESC}1;34mgit:(${ESC}0;31maimux/amber${ESC}1;34m)${ESC}0m `
export const TERMINAL_HISTORY = [
  'Last login: Thu Nov  5 09:12:44 on ttys004\r\n',
  `${TERMINAL_PROMPT}bun test src\r\n`,
  'bun test v1.3.1\r\n\r\n',
  `src/chat/model.test.ts:\r\n${ESC}32m✓${ESC}0m reduceLine > folds a streamed text block ${ESC}2m[0.41ms]${ESC}0m\r\n`,
  `${ESC}32m✓${ESC}0m reduceLine > turns a <synthetic> answer into a card ${ESC}2m[0.12ms]${ESC}0m\r\n`,
  `${ESC}31m✗${ESC}0m resume > orders this workspace first ${ESC}2m[0.30ms]${ESC}0m\r\n\r\n`,
  ` ${ESC}32m86 pass${ESC}0m\r\n ${ESC}31m1 fail${ESC}0m\r\nRan 87 tests across 12 files. ${ESC}2m[212.00ms]${ESC}0m\r\n`,
  TERMINAL_PROMPT,
].join('')
