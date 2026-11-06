// What the browser preview shows: two projects, three workspaces, chats that draw every
// block kind, a terminal, git changes with a PR, quotas. Dev only (see mock-ipc.ts).

import type { FileChange } from '../app/use-git'
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
  basil: `${TREES}/pragma-once/basil`,
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
        activeAt: now - 2 * MIN,
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
        activeAt: now - 40 * MIN,
        createdAt: now - HOUR,
        effort: 'medium',
        id: 'chat-notes',
        model: 'sonnet',
        sessionId: 'session-notes',
        title: 'Write the release notes',
        workspaceId: 'ws-teal',
      },
      {
        activeAt: now - 23 * HOUR,
        createdAt: now - 25 * HOUR,
        effort: 'high',
        id: 'chat-tiles',
        model: 'opus',
        sessionId: null,
        title: 'Stat tiles in the dashboard',
        workspaceId: 'ws-violet',
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
        // Renamed in place: the colour bar still says violet.
        name: 'stat tiles',
        path: PATHS.violet,
        projectId: 'p-pragma',
        setup: null,
      },
      // No pull request yet, two commits to push.
      {
        base: 'origin/main',
        branch: 'aimux/basil',
        createdAt: now - 2 * HOUR,
        id: 'ws-basil',
        name: 'basil',
        path: PATHS.basil,
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
const sent = (uuid: string, text: string, images: string[] = []) =>
  line({
    message: {
      message: {
        content: [
          ...images.map((data) => ({
            source: { data, media_type: 'image/png', type: 'base64' },
            type: 'image',
          })),
          { text, type: 'text' },
        ],
        role: 'user',
      },
      type: 'user',
      uuid,
    },
    type: 'aimux_sent',
  })
/** A pasted screenshot: a context menu, its second row hovered. */
const MENU_SHOT =
  'iVBORw0KGgoAAAANSUhEUgAAAPAAAACWCAIAAABvmpKCAAAB7ElEQVR42u3dMQ5AQBRFUZsR1mADtmxLKGlosATJRGL+Py+30cqJZIqJ5jwPKUyNVyCgJaAloCWgBbQEtAS0BLQEtICWgJaAloCWgBbQEtAS0BLQ0u9Ar8uswGUEfVnQAW1AA21AA21AA21AAw000AY00AY00AY00AY00EADbUDHBt13bbCABhpooIEGGmiggQbaodCANqCBNqCBNqCBNqCBNqANaKANaKANaKANaKCBTg563zdVHdBAAw20gAZaQAMtoIEGGmiggU4HOt4VrJKABhpooIEGGmiggQbaodChEGgBDbSABlpAAw000AIaaAHtCpa5ggW0AQ000EAb0EAb0EAb0EAb0EADDbQBDbQBDbQB7ceb2X+tCTTQQAMNNNBAAw20Q6EBDbQBDTTQQBvQQBvQQBvQQBvQQAMNtAENtAENtAFdCPp5VNUB7QvtCw20AQ20AQ20AQ20AW1AA21AA21AA21AAw000AY00AZ0laCncdDLgAYaaKCBBhpooIEG2hwKgTaggTaggTaggQYaaAMaaAMaaAMaaAMaaKCBNqCBNqCBNqCBNqANaKANaKANaKANaKCBBtqABtqABtqA/ga0ApcOtAS0BLSAloCWgJaAloAW0BLQEtAS0BLQAloCWgJaAloCWkG7AXeSjelxh8INAAAAAElFTkSuQmCC'
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

export const CONTEXT_OUTPUT = `## Context Usage

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
  sent('u-menus-1', 'Why does the context menu lose its hovered row when the mouse stays still?', [
    MENU_SHOT,
  ]),
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
      tool_use_id: 'tool-test',
    },
    request_id: 'perm-tests',
    type: 'control_request',
  }),
  LIVE,
]

/** `?question`: the busy chat asks with AskUserQuestion instead of running the tests. */
const QUESTIONS = [
  {
    header: 'Scope',
    multiSelect: false,
    options: [
      { description: 'Only the files this branch touched.', label: 'Changed files' },
      { description: 'Slower, catches what the menus broke elsewhere.', label: 'Whole suite' },
    ],
    question: 'Which tests should I run?',
  },
  {
    header: 'Fixes',
    multiSelect: true,
    options: [
      { description: 'Commit nothing, list what fails.', label: 'Report only' },
      { description: 'Patch what fails in the menus.', label: 'Fix menus' },
      { description: 'Patch the snapshot files too.', label: 'Update snapshots' },
    ],
    question: 'What may I change?',
  },
]
export const QUESTION_ASK = [
  assistant('m-menus-ask', [
    { id: 'tool-ask', input: { questions: QUESTIONS }, name: 'AskUserQuestion', type: 'tool_use' },
  ]),
  line({
    request: {
      input: { questions: QUESTIONS },
      permission_suggestions: [],
      subtype: 'can_use_tool',
      tool_name: 'AskUserQuestion',
      tool_use_id: 'tool-ask',
    },
    request_id: 'perm-question',
    type: 'control_request',
  }),
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

/** `?attention`: the finished chat asks again while another is on screen (the toast). */
export const NOTES_ASK = line({
  request: {
    description: 'Open the pull request',
    input: { command: 'gh pr create --fill', description: 'Open the pull request' },
    permission_suggestions: [],
    subtype: 'can_use_tool',
    tool_name: 'Bash',
  },
  request_id: 'perm-notes',
  type: 'control_request',
})

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

/** The crimson session (its workspace deleted since), so a `/resume` of it has a past. */
TRANSCRIPTS['session-quotas'] = [
  line({
    message: { content: 'Make the quota bars warn at 60% and go red at 85%.', role: 'user' },
    type: 'user',
    uuid: 'q-1',
  }),
  line({
    message: {
      content: [
        { text: 'The tones live in one function; I will change its thresholds.', type: 'text' },
        {
          id: 'tool-q-edit',
          input: {
            file_path: `${TREES}/aimux-desktop/crimson/src/app/quotas.tsx`,
            new_string:
              "  if (percent >= 85) return 'bg-critical'\n  if (percent >= 60) return 'bg-warn'",
            old_string:
              "  if (percent >= 90) return 'bg-critical'\n  if (percent >= 75) return 'bg-warn'",
          },
          name: 'Edit',
          type: 'tool_use',
        },
      ],
      id: 'm-q-1',
    },
    type: 'assistant',
  }),
  line({
    message: {
      content: [
        {
          content: 'The file src/app/quotas.tsx has been updated.',
          tool_use_id: 'tool-q-edit',
          type: 'tool_result',
        },
      ],
      role: 'user',
    },
    type: 'user',
    uuid: 'q-2',
  }),
  line({
    message: {
      content: [
        {
          text: 'Done: bars turn amber at **60%** and red at **85%**, in the chip and the popover alike.',
          type: 'text',
        },
      ],
      id: 'm-q-2',
    },
    type: 'assistant',
  }),
]

/** A setup script's run, line by line: it takes a while, then ends well. */
export const SETUP_RUN = [
  '$ bun install\r\n',
  'bun install v1.3.1\r\n',
  'Resolving dependencies… 412 packages\r\n',
  'Copied .env from the main checkout\r\n',
  '\x1b[32m✓\x1b[0m Setup finished in 7.4s\r\n',
]

/** What a fresh chat's Claude says when the window writes to it: the answer, streamed. */
export function streamedReply(id: string, text: string): string[] {
  const event = (e: unknown) => line({ event: e, type: 'stream_event' })
  // Words, a few at a time: about twenty deltas.
  const words = text.split(/(?<= )/)
  const step = Math.max(1, Math.ceil(words.length / 20))
  const deltas: string[] = []
  for (let i = 0; i < words.length; i += step) {
    deltas.push(
      event({
        delta: { text: words.slice(i, i + step).join(''), type: 'text_delta' },
        index: 0,
        type: 'content_block_delta',
      })
    )
  }
  return [
    event({ message: { id }, type: 'message_start' }),
    event({ content_block: { text: '', type: 'text' }, index: 0, type: 'content_block_start' }),
    ...deltas,
    event({ index: 0, type: 'content_block_stop' }),
    assistant(id, [{ text, type: 'text' }]),
  ]
}

export const previewAnswer = (prompt: string) =>
  `(Preview) No Claude runs in the browser; this stands in for the answer to “${prompt}”. ` +
  'It streams in word by word, so the caret, the shimmer and Esc can be tried out.'

/** A tool the preview's Claude asks to run, and the permission it waits for. */
export function toolAsk(messageId: string, toolId: string, requestId: string, prompt: string) {
  const input = { command: 'bun test src', description: 'Run the unit tests' }
  const text = `Before I answer “${prompt}”, let me run the tests.`
  return [
    ...streamedReply(messageId, text).slice(0, -1),
    line({
      event: {
        content_block: { id: toolId, input: {}, name: 'Bash', type: 'tool_use' },
        index: 1,
        type: 'content_block_start',
      },
      type: 'stream_event',
    }),
    assistant(messageId, [
      { text, type: 'text' },
      { id: toolId, input, name: 'Bash', type: 'tool_use' },
    ]),
    line({
      request: {
        description: input.description,
        input,
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
        tool_use_id: toolId,
      },
      request_id: requestId,
      type: 'control_request',
    }),
  ]
}

export const toolDone = (toolId: string, allowed: boolean) =>
  allowed
    ? toolResult(toolId, ' 86 pass\n 0 fail\nRan 86 tests across 12 files. [212.00ms]')
    : toolResult(toolId, 'The user declined this action.', true)

export const turnEnd = (cost = 0.0012, ms = 2100) => result(cost, ms)

/** What a local command (`/model sonnet`) prints instead of an answer. */
export const localOutput = (text: string) => [
  assistant(`m-${crypto.randomUUID()}`, [{ text, type: 'text' }], '<synthetic>'),
  result(0, 40),
]

/** Claude Code's answer to an interrupt: the request is acknowledged, the turn ends. */
export const interrupted = (requestId: string) => [
  line({
    response: { request_id: requestId, response: {}, subtype: 'success' },
    type: 'control_response',
  }),
  line({ is_error: false, subtype: 'error_during_execution', type: 'result' }),
]

/** How Claude Code's transcript records a local command and what it printed. */
const localCommand = (content: string) =>
  line({ content, subtype: 'local_command', type: 'system' })

/** The host's replay lines of a chat, as Claude Code's transcript keeps them. */
export function asTranscript(lines: string[]): string[] {
  return lines.flatMap((raw) => {
    const m = JSON.parse(raw) as { type?: string; message?: Record<string, unknown> }
    // A local command's output (`/context`): a `system` line, not an answer of Claude's.
    if (m.type === 'assistant' && m.message?.model === '<synthetic>') {
      const text = (m.message.content as { text?: string }[])[0]?.text ?? ''
      return [localCommand(`<local-command-stdout>${text}</local-command-stdout>`)]
    }
    if (m.type === 'assistant' || m.type === 'user') return [raw]
    if (m.type !== 'aimux_sent') return []
    const sentLine = m.message as {
      uuid?: string
      message?: { content?: { type?: string; text?: string }[] }
    }
    const content = sentLine.message?.content ?? []
    const text = content.find((part) => part.type === 'text')?.text ?? ''
    const command = /^\/(\S+)\s*([\s\S]*)$/.exec(text)
    if (command)
      return [
        localCommand(
          `<command-name>/${command[1]}</command-name>\n<command-message>${command[1]}</command-message>\n<command-args>${command[2]}</command-args>`
        ),
      ]
    return [
      line({
        message: { content, role: 'user' },
        type: 'user',
        uuid: sentLine.uuid,
      }),
    ]
  })
}

/** A Claude started for a chat: a new session, or the one it resumes. */
/** A chat's Claude starting: on the model it was given (`--model`), Claude Code's default if none. */
export const freshChat = (chatId: string, resumed: string | null, model = '') => [
  initAnswer(chatId),
  systemInit(
    resumed ?? `session-${chatId}`,
    INIT.models.find((m) => m.value === (model || 'default'))?.resolvedModel ?? model
  ),
]

// Git.

const change = (
  path: string,
  status: string,
  staged: boolean,
  add: number | null,
  del: number | null
): FileChange => ({
  add,
  del,
  path,
  staged,
  status,
  unstaged: !staged,
  untracked: false,
})

export const GIT_STATUS: Record<string, FileChange[]> = {
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
  [PATHS.basil]: [change('src/tiles/grid.ts', 'M', false, 14, 6)],
  [PATHS.teal]: [change('CHANGELOG.md', 'M', false, 18, 2)],
  // Left behind after the merge: deleting the workspace asks "Delete anyway".
  [PATHS.violet]: [change('notes.md', 'M', false, 3, 1)],
}

export interface MockBranch {
  ahead: number
  behind: number
  branch: string
  remote: boolean
  upstream: boolean
}

export const GIT_BRANCH: Record<string, MockBranch> = {
  [PATHS.amber]: { ahead: 2, behind: 0, branch: 'aimux/amber', remote: true, upstream: true },
  [PATHS.basil]: { ahead: 2, behind: 0, branch: 'aimux/basil', remote: true, upstream: true },
  [PATHS.teal]: { ahead: 0, behind: 0, branch: 'aimux/teal', remote: true, upstream: true },
  // Merged, then a commit on top: the head offers no Push into a merged branch.
  [PATHS.violet]: { ahead: 1, behind: 0, branch: 'aimux/violet', remote: true, upstream: true },
}

/** `gh pr view --json …`, raw. */
export const PRS: Record<string, { state: string } & Record<string, unknown>> = {
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
      {
        conclusion: 'SUCCESS',
        detailsUrl: 'https://github.com/nbardavid/aimux-desktop/actions/runs/101/job/1',
        name: 'lint',
        status: 'COMPLETED',
      },
      {
        conclusion: 'SUCCESS',
        detailsUrl: 'https://github.com/nbardavid/aimux-desktop/actions/runs/101/job/2',
        name: 'test',
        status: 'COMPLETED',
      },
      {
        conclusion: 'FAILURE',
        detailsUrl: 'https://github.com/nbardavid/aimux-desktop/actions/runs/101/job/3',
        name: 'build (macos-14)',
        status: 'COMPLETED',
      },
      {
        context: 'cargo test',
        state: 'SUCCESS',
        targetUrl: 'https://ci.example.com/aimux-desktop/128',
      },
    ],
    title: 'Port menus and pickers to Base UI',
    url: 'https://github.com/nbardavid/aimux-desktop/pull/128',
  },
  // Open, green and mergeable: the head's band goes pale green.
  [PATHS.teal]: {
    additions: 86,
    baseRefName: 'main',
    body: 'The 0.4 release notes, from the merged pull requests.',
    changedFiles: 2,
    deletions: 4,
    headRefName: 'aimux/teal',
    isDraft: false,
    mergeable: 'MERGEABLE',
    mergeStateStatus: 'CLEAN',
    number: 131,
    state: 'OPEN',
    statusCheckRollup: [
      { conclusion: 'SUCCESS', name: 'lint', status: 'COMPLETED' },
      { conclusion: 'SUCCESS', name: 'test', status: 'COMPLETED' },
    ],
    title: 'Release notes for 0.4',
    url: 'https://github.com/nbardavid/aimux-desktop/pull/131',
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

const CHANGELOG_DIFF = `diff --git a/CHANGELOG.md b/CHANGELOG.md
index 1a2b3c4..5d6e7f8 100644
--- a/CHANGELOG.md
+++ b/CHANGELOG.md
@@ -1,6 +1,22 @@
 # Changelog

-## Unreleased
+## 0.2.0
+
+### New
+
+- Slash commands: a \`/\` menu in every chat, with the app's own commands first.
+- Command cards: what \`/context\` or \`/usage\` print shows as a card, not as Claude.
+- \`/resume\` across the whole project, this workspace's sessions first.
+- Self-updating releases: the update pill installs and restarts.
+
+### Fixed
+
+- The context menu keeps its hovered row under a still mouse.
+- Tabs reopen with their chats after a restart.
+
+## 0.1.0
+
+- First release.

 ## 0.0.1
-
-- Prototype.
`

/** A plausible diff for a file the fixtures name by its counts alone. */
function diffFor(file: FileChange): string {
  const name = file.path.split('/').pop() ?? file.path
  const added = Math.min(file.add ?? 0, 40)
  const removed = Math.min(file.del ?? 0, 40)
  const old = file.untracked || file.status === 'A' ? '/dev/null' : `a/${file.path}`
  const fresh = file.status === 'D' ? '/dev/null' : `b/${file.path}`
  const body = [
    ...Array.from({ length: removed }, (_, i) => `-  // ${name}: old line ${i + 1}`),
    ...Array.from({ length: added }, (_, i) => `+  // ${name}: new line ${i + 1}`),
  ]
  return [
    `diff --git a/${file.path} b/${file.path}`,
    `--- ${old}`,
    `+++ ${fresh}`,
    `@@ -${removed === 0 ? 0 : 1},${removed} +${added === 0 ? 0 : 1},${added} @@`,
    ...body,
    '',
  ].join('\n')
}

/** `git_diff` of one file: a hand-written one when there is one, else made from its counts. */
export function diffOf(path: string, file: string): string {
  if (file === 'src/app/context-menu.tsx') return DIFF
  if (file === 'CHANGELOG.md') return CHANGELOG_DIFF
  const change = GIT_STATUS[path]?.find((f) => f.path === file)
  return change ? diffFor(change) : ''
}

/** `?long`: what truncates first at 1000px. A project with a 30-character name, a workspace
 * with eight long-titled tabs, a 60-character branch and forty deeply nested files. */
export function longFixture() {
  const path = `${HOME}/dev/customer-portal-infrastructure`
  const ws = `${TREES}/customer-portal-infrastructure/indigo`
  const titles = [
    'Migrate the billing webhooks onto the new event bus',
    'Why does the invoice PDF render twice on Safari?',
    'Write integration tests for the refund flow',
    'Rename the tenant settings page and its routes',
    'Audit every feature flag still read at startup',
    'Draft the incident report for Tuesday’s outage',
  ]
  const deep = [
    'apps/web/src/features/billing/webhooks/handlers',
    'apps/web/src/features/billing/invoices/components/pdf',
    'packages/event-bus/src/adapters/postgres/listeners',
    'services/payments/internal/providers/stripe/webhooks',
  ]
  const files = Array.from({ length: 40 }, (_, i) =>
    change(
      `${deep[(i >> 2) % deep.length]}/${['subscription', 'invoice', 'refund', 'customer', 'tenant'][i % 5]}-${['created', 'updated', 'deleted', 'renewed'][i % 4]}.handler.ts`,
      ['M', 'M', 'A', 'D'][i % 4] ?? 'M',
      i % 3 === 0,
      i % 4 === 3 ? 0 : 3 + ((i * 7) % 60),
      i % 4 === 2 ? 0 : (i * 5) % 40
    )
  )
  return {
    branch: {
      ahead: 3,
      behind: 0,
      branch: 'aimux/indigo-migrate-billing-webhooks-onto-the-new-event-bus',
      remote: true,
      upstream: true,
    },
    chats: titles.map((title, i) => ({
      createdAt: now - (60 - i) * MIN,
      effort: '',
      id: `chat-long-${i}`,
      model: '',
      sessionId: null,
      title,
      workspaceId: 'ws-indigo',
    })),
    files,
    path: ws,
    project: {
      id: 'p-long',
      lastOpenedAt: now + HOUR,
      name: 'customer-portal-infrastructure',
      path,
    },
    terms: ['bun run dev --filter @portal/web', 'docker compose logs -f payments'].map(
      (title, i) => ({
        code: null,
        command: null,
        cwd: ws,
        ended: false,
        id: `term-long-${i}`,
        tag: null,
        title,
        workspaceId: 'ws-indigo',
      })
    ),
    workspace: {
      base: 'origin/main',
      branch: 'aimux/indigo-migrate-billing-webhooks-onto-the-new-event-bus',
      createdAt: now - 2 * HOUR,
      id: 'ws-indigo',
      name: 'indigo',
      path: ws,
      projectId: 'p-long',
      setup: null,
    },
  }
}

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
