import { describe, expect, test } from 'bun:test'

import {
  addNote,
  addUserTurn,
  artifactUrl,
  type Block,
  type ChatState,
  contextUsageLine,
  contextUsed,
  contextWindow,
  exitCode,
  initialChat,
  liveStep,
  modelSet,
  newPublishes,
  numberedLines,
  parseCommands,
  type Permission,
  permissionLine,
  publishedArtifacts,
  questionsOf,
  reduceLine,
  replayTranscript,
  toolSummary,
  userLine,
} from './model'

function feed(lines: unknown[], from: ChatState = initialChat) {
  let state = from
  for (const line of lines) state = reduceLine(state, JSON.stringify(line))
  return state
}

const ev = (event: unknown, parent: string | null = null) => ({
  event,
  parent_tool_use_id: parent,
  type: 'stream_event',
})

describe('reduceLine', () => {
  test('init names the session and the model', () => {
    const s = feed([
      { model: 'claude-haiku-5-5', session_id: 's1', subtype: 'init', type: 'system' },
    ])
    expect(s).toMatchObject({ model: 'claude-haiku-5-5', sessionId: 's1', status: 'idle' })
  })

  test('streamed text and thinking build one assistant turn', () => {
    const s = feed([
      ev({ message: { id: 'm1' }, type: 'message_start' }),
      ev({
        content_block: { thinking: '', type: 'thinking' },
        index: 0,
        type: 'content_block_start',
      }),
      ev({
        delta: { thinking: 'Hmm', type: 'thinking_delta' },
        index: 0,
        type: 'content_block_delta',
      }),
      ev({ content_block: { text: '', type: 'text' }, index: 1, type: 'content_block_start' }),
      ev({ delta: { text: 'Hel', type: 'text_delta' }, index: 1, type: 'content_block_delta' }),
      ev({ delta: { text: 'lo', type: 'text_delta' }, index: 1, type: 'content_block_delta' }),
      // The full message repeats a streamed block: nothing doubles.
      { message: { content: [{ text: 'Hello', type: 'text' }], id: 'm1' }, type: 'assistant' },
    ])
    expect(s.turns).toEqual([
      {
        blocks: [
          { kind: 'thinking', text: 'Hmm' },
          { kind: 'text', text: 'Hello' },
        ],
        id: 'm1',
        role: 'assistant',
      },
    ])
    expect(s.status).toBe('working')
  })

  test('a tool call gets its input, then its result', () => {
    const s = feed([
      ev({ message: { id: 'm1' }, type: 'message_start' }),
      ev({
        content_block: { id: 't1', input: {}, name: 'Bash', type: 'tool_use' },
        index: 0,
        type: 'content_block_start',
      }),
      ev({
        delta: { partial_json: '{"comm', type: 'input_json_delta' },
        index: 0,
        type: 'content_block_delta',
      }),
      ev({
        delta: { partial_json: 'and":"ls"}', type: 'input_json_delta' },
        index: 0,
        type: 'content_block_delta',
      }),
      ev({ index: 0, type: 'content_block_stop' }),
      {
        message: {
          content: [{ content: 'a.txt', is_error: false, tool_use_id: 't1', type: 'tool_result' }],
        },
        parent_tool_use_id: null,
        type: 'user',
      },
    ])
    expect(s.turns[0]?.blocks[0]).toMatchObject({
      input: { command: 'ls' },
      kind: 'tool',
      name: 'Bash',
      result: { isError: false, text: 'a.txt' },
    })
  })

  test('an unstreamed assistant message still shows', () => {
    const s = feed([
      { message: { content: [{ text: 'Hi', type: 'text' }], id: 'm9' }, type: 'assistant' },
    ])
    expect(s.turns[0]?.blocks).toEqual([{ kind: 'text', text: 'Hi' }])
  })

  test("a sub-agent's messages go to its own chat, under the call that started it", () => {
    const s = feed([
      {
        message: {
          content: [{ id: 'u1', input: { file_path: '/w/a.ts' }, name: 'Read', type: 'tool_use' }],
          id: 'm2',
        },
        parent_tool_use_id: 't1',
        type: 'assistant',
      },
      {
        message: { content: [{ content: 'ok', tool_use_id: 'u1', type: 'tool_result' }] },
        parent_tool_use_id: 't1',
        type: 'user',
      },
      ev({ delta: { text: 'x', type: 'text_delta' }, index: 0, type: 'content_block_delta' }, 't1'),
    ])
    expect(s.turns).toEqual([])
    const read = s.agents.t1?.[0]?.blocks[0]
    expect(read).toMatchObject({ kind: 'tool', name: 'Read', result: { text: 'ok' } })
  })

  test('a permission request waits, the result clears it and ends the turn', () => {
    const asked = feed(
      [
        {
          request: {
            input: { content: 'ok', file_path: '/w/b.txt' },
            permission_suggestions: [{ mode: 'acceptEdits', type: 'setMode' }],
            subtype: 'can_use_tool',
            tool_name: 'Write',
          },
          request_id: 'r1',
          type: 'control_request',
        },
      ],
      addUserTurn(initialChat, 'write it', 'u1')
    )
    expect(asked.pending).toHaveLength(1)
    const done = feed(
      [{ duration_ms: 1200, subtype: 'success', total_cost_usd: 0.01, type: 'result' }],
      asked
    )
    expect(done).toMatchObject({ pending: [], status: 'idle' })
    expect(done.turns.at(-1)?.end).toEqual({ costUsd: 0.01, durationMs: 1200, stopped: false })
  })

  test('a failed turn and the process exit are said', () => {
    const s = feed([
      { result: 'boom', subtype: 'error_during_execution', type: 'result' },
      { type: 'aimux_exit' },
    ])
    expect(s.errors).toEqual(['boom'])
    expect(s.status).toBe('exited')
  })

  test('the local echo marks the chat as working', () => {
    const s = addUserTurn(initialChat, 'hello', 'u1')
    expect(s.turns).toEqual([{ blocks: [{ kind: 'text', text: 'hello' }], id: 'u1', role: 'user' }])
    expect(s.status).toBe('working')
  })

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
      request: { input: {}, subtype: 'can_use_tool', tool_name: 'Bash' },
      request_id: 'r1',
      type: 'control_request',
    })
    let state = reduceLine(initialChat, asked)
    expect(state.pending).toHaveLength(1)
    const answer = permissionLine(state.pending[0] as Permission, 'allow')
    state = reduceLine(state, JSON.stringify({ message: JSON.parse(answer), type: 'aimux_sent' }))
    expect(state.pending).toHaveLength(0)
  })
})

test("a replayed chat keeps each sub-agent's work, its unfinished tools stopped", () => {
  const s = replayTranscript([
    JSON.stringify({
      aimuxAgent: 't1',
      isSidechain: true,
      message: {
        content: [{ id: 'u1', input: { command: 'ls' }, name: 'Bash', type: 'tool_use' }],
        id: 'm1',
      },
      type: 'assistant',
    }),
  ])
  expect(s.turns).toEqual([])
  expect(s.agents.t1?.[0]?.blocks[0]).toMatchObject({ name: 'Bash', stopped: true })
})

describe('the context window', () => {
  const usage = {
    cache_creation_input_tokens: 300,
    cache_read_input_tokens: 90_000,
    input_tokens: 2,
    output_tokens: 500,
  }
  const answer = (id: string) => ({
    message: { content: [{ text: 'ok', type: 'text' }], id, usage },
    type: 'assistant',
  })

  test("the last answer's usage fills it; the turn's result gives its size", () => {
    const s = feed([answer('m1')])
    expect(s.context).toEqual({ added: 302, cached: 90_000, output: 500, window: null })
    expect(s.context && contextUsed(s.context)).toBe(90_802)
    const ended = feed(
      [
        {
          modelUsage: { 'claude-opus-5-5': { contextWindow: 1_000_000 } },
          subtype: 'success',
          type: 'result',
        },
      ],
      s
    )
    expect(ended.context?.window).toBe(1_000_000)
    expect(feed([answer('m2')], ended).context?.window).toBe(1_000_000)
  })

  test("a sub-agent's usage is its own", () => {
    expect(feed([{ ...answer('m1'), parent_tool_use_id: 't1' }]).context).toBeNull()
  })

  test('without a reported size: 1M for a [1m] model or past 200k, 200k otherwise', () => {
    const c = { added: 0, cached: 1000, output: 0, window: null }
    expect(contextWindow(c, 'claude-opus-5-5')).toBe(200_000)
    expect(contextWindow(c, 'claude-opus-5-5[1m]')).toBe(1_000_000)
    expect(contextWindow({ ...c, cached: 250_000 }, null)).toBe(1_000_000)
  })

  test('an answer whose usage is all zeros (a local command) keeps the context', () => {
    const zero = {
      message: {
        content: [{ text: 'x', type: 'text' }],
        id: 'm9',
        usage: { input_tokens: 0, output_tokens: 0 },
      },
      type: 'assistant',
    }
    expect(feed([answer('m1'), zero]).context?.cached).toBe(90_000)
  })

  test("Claude Code's own breakdown, asked for with get_context_usage, is kept", () => {
    expect(JSON.parse(contextUsageLine('usage-1'))).toEqual({
      request: { subtype: 'get_context_usage' },
      request_id: 'usage-1',
      type: 'control_request',
    })
    const s = feed([
      {
        response: {
          request_id: 'usage-1',
          response: {
            categories: [
              { color: 'promptBorder', name: 'System prompt', tokens: 2800 },
              { color: 'inactive', isDeferred: true, name: 'MCP tools (deferred)', tokens: 63_400 },
              { color: 'inactive', name: 'Free space', tokens: 915_600 },
            ],
            maxTokens: 1_000_000,
            mcpTools: [{ isLoaded: false, name: 'mcp__a__click', serverName: 'a', tokens: 300 }],
            percentage: 5,
            totalTokens: 51_400,
          },
          subtype: 'success',
        },
        type: 'control_response',
      },
    ])
    expect(s.usage).toEqual({
      categories: [
        { deferred: false, name: 'System prompt', tokens: 2800 },
        { deferred: true, name: 'MCP tools (deferred)', tokens: 63_400 },
        { deferred: false, name: 'Free space', tokens: 915_600 },
      ],
      max: 1_000_000,
      mcpTools: [{ loaded: false, name: 'mcp__a__click', server: 'a', tokens: 300 }],
      total: 51_400,
    })
  })

  test('a replayed chat knows its context from the transcript', () => {
    const s = replayTranscript([JSON.stringify(answer('m1'))])
    expect(s.context?.cached).toBe(90_000)
  })

  const usageAnswer = {
    response: {
      request_id: 'usage-2',
      response: { categories: [], maxTokens: 1_000_000, totalTokens: 70_900 },
      subtype: 'success',
    },
    type: 'control_response',
  }

  test('a compaction forgets the context it emptied, until something measures it again', () => {
    const boundary = { compact_metadata: { pre_tokens: 165_815 }, subtype: 'compact_boundary' }
    const s = feed([answer('m1'), usageAnswer, { ...boundary, type: 'system' }])
    expect(s.context).toBeNull()
    expect(s.usage).toBeNull()
    const replayed = replayTranscript(
      [answer('m1'), { ...boundary, type: 'system' }].map((l) => JSON.stringify(l))
    )
    expect(replayed.context).toBeNull()
  })

  test("Claude Code's breakdown is the context's measure until the next answer", () => {
    const s = feed([answer('m1'), usageAnswer])
    expect(s.context && contextUsed(s.context)).toBe(70_900)
    expect(s.context?.window).toBe(1_000_000)
    const next = feed([answer('m2')], s)
    expect(next.context && contextUsed(next.context)).toBe(90_802)
    expect(next.context?.window).toBe(1_000_000)
  })
})

describe('permissionLine', () => {
  const p = {
    description: null,
    input: { a: 1 },
    requestId: 'r1',
    suggestions: [{ x: 1 }],
    toolName: 'Write',
    toolUseId: 't1',
  }

  test('allow passes the input back; always adds the suggestions', () => {
    expect(JSON.parse(permissionLine(p, 'allow')).response.response).toEqual({
      behavior: 'allow',
      updatedInput: { a: 1 },
    })
    expect(JSON.parse(permissionLine(p, 'always')).response.response.updatedPermissions).toEqual([
      { x: 1 },
    ])
  })

  test('deny answers the same request', () => {
    const line = JSON.parse(permissionLine(p, 'deny'))
    expect(line.response.request_id).toBe('r1')
    expect(line.response.response.behavior).toBe('deny')
  })
})

describe('AskUserQuestion', () => {
  const ask = {
    description: null,
    input: {
      questions: [
        {
          header: 'Fruit',
          multiSelect: false,
          options: [{ description: 'Red', label: 'Apple' }, { label: 'Pear' }],
          question: 'Which fruit?',
        },
      ],
    },
    requestId: 'r2',
    suggestions: [],
    toolName: 'AskUserQuestion',
    toolUseId: 't2',
  }

  test('reads its questions; any other tool has none', () => {
    expect(questionsOf(ask)).toEqual([
      {
        header: 'Fruit',
        multiSelect: false,
        options: [
          { description: 'Red', label: 'Apple' },
          { description: '', label: 'Pear' },
        ],
        question: 'Which fruit?',
      },
    ])
    expect(questionsOf({ ...ask, toolName: 'Bash' })).toBeNull()
  })

  test('the picks go back in its input, keyed by question', () => {
    const line = JSON.parse(permissionLine(ask, 'allow', { 'Which fruit?': 'Pear' }))
    expect(line.response.response).toEqual({
      behavior: 'allow',
      updatedInput: { ...ask.input, answers: { 'Which fruit?': 'Pear' } },
    })
  })
})

test('toolSummary shows paths relative to the workspace', () => {
  expect(toolSummary('Read', { file_path: '/w/src/a.ts' }, '/w')).toBe('src/a.ts')
  expect(toolSummary('Bash', { command: 'ls -la' }, '/w')).toBe('ls -la')
  expect(toolSummary('mcp__x__y', { query: 'cats' }, '/w')).toBe('cats')
})

test('a transcript replays prompts, joined blocks and tool results', () => {
  const lines = [
    JSON.stringify({ mode: 'x', type: 'mode' }),
    JSON.stringify({ message: { content: 'Fix it', role: 'user' }, type: 'user', uuid: 'u1' }),
    JSON.stringify({
      message: { content: [{ thinking: 'hmm', type: 'thinking' }], id: 'm1' },
      type: 'assistant',
    }),
    JSON.stringify({
      message: {
        content: [{ id: 't1', input: { command: 'ls' }, name: 'Bash', type: 'tool_use' }],
        id: 'm1',
      },
      type: 'assistant',
    }),
    JSON.stringify({
      message: { content: [{ content: 'a.ts', tool_use_id: 't1', type: 'tool_result' }] },
      type: 'user',
    }),
    JSON.stringify({ isMeta: true, message: { content: 'caveat' }, type: 'user' }),
    JSON.stringify({ message: { content: '<bash-stdout>x</bash-stdout>' }, type: 'user' }),
  ]
  const state = replayTranscript(lines)
  expect(state.turns.map((t) => t.role)).toEqual(['user', 'assistant'])
  const blocks = state.turns[1]?.blocks ?? []
  expect(blocks.map((b) => b.kind)).toEqual(['thinking', 'tool'])
  const tool = blocks[1]
  expect(tool?.kind === 'tool' ? tool.result?.text : null).toBe('a.ts')
  expect(state.status).toBe('starting')
})

describe('commands', () => {
  const synthetic = (text: string) =>
    JSON.stringify({
      message: { content: [{ text, type: 'text' }], id: 'm', model: '<synthetic>' },
      type: 'assistant',
    })

  test('initialize carries the chat’s commands', () => {
    const line = JSON.stringify({
      response: {
        response: {
          commands: [{ argumentHint: '<x>', builtin: true, description: 'd', name: 'compact' }],
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

  test('parseCommands drops what is malformed', () => {
    expect(parseCommands([{ name: 'x' }, { description: 'no name' }, 42])).toEqual([
      { aliases: [], argumentHint: '', builtin: false, description: '', name: 'x' },
    ])
    expect(parseCommands(undefined)).toEqual([])
  })

  test('a typed command shows as a command', () => {
    expect(addUserTurn(initialChat, '/compact keep tests', 'u').turns[0]?.blocks[0]).toEqual({
      args: 'keep tests',
      kind: 'command',
      name: 'compact',
    })
  })

  test('a path is not a command', () => {
    expect(addUserTurn(initialChat, '/usr/bin/env is weird', 'u').turns[0]?.blocks[0]?.kind).toBe(
      'text'
    )
  })

  test('synthetic output after a command is a card', () => {
    const s = addUserTurn(initialChat, '/context', 'u')
    const out = reduceLine(s, synthetic('## Context'))
    expect(out.turns.at(-1)?.blocks).toEqual([{ kind: 'output', text: '## Context' }])
  })

  test('a synthetic error after a normal prompt stays a message', () => {
    const s = addUserTurn(initialChat, 'hello', 'u')
    const out = reduceLine(s, synthetic('API Error'))
    expect(out.turns.at(-1)?.blocks[0]?.kind).toBe('text')
  })

  test('a replayed send of a command shows as a command', () => {
    const sent = JSON.stringify({
      message: JSON.parse(userLine('/context', null)),
      type: 'aimux_sent',
    })
    expect(reduceLine(initialChat, sent).turns[0]?.blocks[0]?.kind).toBe('command')
  })

  test('replayed local command output becomes a card', () => {
    const lines = [
      JSON.stringify({
        content: '<local-command-stdout>Set model to opus</local-command-stdout>',
        subtype: 'local_command',
        type: 'system',
      }),
      JSON.stringify({
        content: '<local-command-stdout></local-command-stdout>',
        subtype: 'local_command',
        type: 'system',
      }),
    ]
    expect(replayTranscript(lines).turns).toHaveLength(1)
    expect(replayTranscript(lines).turns[0]?.blocks).toEqual([
      { kind: 'output', text: 'Set model to opus' },
    ])
  })

  test('replayed command prompts become command chips', () => {
    const content =
      '<command-name>/compact</command-name>\n  <command-message>compact</command-message>\n  <command-args>keep tests</command-args>'
    const lines = [
      JSON.stringify({ message: { content, role: 'user' }, type: 'user', uuid: 'u1' }),
      JSON.stringify({ content, subtype: 'local_command', type: 'system', uuid: 's1' }),
    ]
    const turns = replayTranscript(lines).turns
    expect(turns.map((t) => t.blocks[0])).toEqual([
      { args: 'keep tests', kind: 'command', name: 'compact' },
      { args: 'keep tests', kind: 'command', name: 'compact' },
    ])
  })
})

test('a stop in progress ends with the turn’s result, or with the process', () => {
  const stopping = { ...initialChat, status: 'working' as const, stopping: true }
  expect(feed([{ subtype: 'error_during_execution', type: 'result' }], stopping).stopping).toBe(
    false
  )
  expect(feed([{ type: 'aimux_exit' }], stopping).stopping).toBe(false)
  expect(feed([{ subtype: 'error_during_execution', type: 'result' }], stopping).errors).toEqual([])
  expect(feed([ev({ message: { id: 'm1' }, type: 'message_start' })], stopping).stopping).toBe(true)
})

describe('a turn that ends', () => {
  const toolUse = (id: string) => ({
    message: {
      content: [{ id, input: { command: 'bun test' }, name: 'Bash', type: 'tool_use' }],
      id: `m-${id}`,
    },
    type: 'assistant',
  })
  const toolOf = (s: ChatState, id: string) =>
    s.turns.flatMap((t) => t.blocks).find((b) => b.kind === 'tool' && b.id === id)

  test('stops every tool call still without a result', () => {
    const working = { ...initialChat, status: 'working' as const, stopping: true }
    const s = feed(
      [
        toolUse('t1'),
        toolUse('t2'),
        {
          message: { content: [{ content: 'ok', tool_use_id: 't1', type: 'tool_result' }] },
          type: 'user',
        },
        { subtype: 'error_during_execution', type: 'result' },
      ],
      working
    )
    expect(toolOf(s, 't1')).toMatchObject({ result: { text: 'ok' } })
    expect(toolOf(s, 't1')).not.toHaveProperty('stopped')
    expect(toolOf(s, 't2')).toMatchObject({ stopped: true })
    expect(s.turns.at(-1)?.end).toEqual({ costUsd: 0, durationMs: 0, stopped: true })
  })

  test('a turn that finishes on its own is not "stopped"', () => {
    const s = feed(
      [{ duration_ms: 900, subtype: 'success', total_cost_usd: 0.002, type: 'result' }],
      addUserTurn(initialChat, 'hi', 'u1')
    )
    expect(s.turns[0]?.end).toEqual({ costUsd: 0.002, durationMs: 900, stopped: false })
  })

  test('a transcript ends whatever its process left running', () => {
    const line = (v: unknown) => JSON.stringify(v)
    const s = replayTranscript([
      line({ message: { content: 'go', role: 'user' }, type: 'user', uuid: 'u1' }),
      line(toolUse('t9')),
    ])
    expect(toolOf(s, 't9')).toMatchObject({ stopped: true })
  })
})

describe('the model a chat runs', () => {
  const synthetic = (text: string) =>
    JSON.stringify({
      message: { content: [{ text, type: 'text' }], id: 'ms', model: '<synthetic>' },
      type: 'assistant',
    })

  test('is read from what `/model` printed', () => {
    expect(modelSet('Set model to Sonnet 5.5')).toBe('Sonnet 5.5')
    expect(modelSet('Set model to **Default (Opus 5.5)**')).toBe('Default')
    expect(modelSet('Context Usage')).toBeNull()
    const typed = reduceLine(
      addUserTurn(initialChat, '/model sonnet', 'u'),
      synthetic('Set model to Sonnet 5.5')
    )
    expect(typed.model).toBe('Sonnet 5.5')
    const replayed = replayTranscript([
      JSON.stringify({
        content: '<local-command-stdout>Set model to Haiku 5.5</local-command-stdout>',
        subtype: 'local_command',
        type: 'system',
      }),
    ])
    expect(replayed.model).toBe('Haiku 5.5')
  })

  test('a pick outside the composer is one faint line, and Claude’s answer to it is dropped', () => {
    let s = addNote(initialChat, 'Model → Sonnet 5.5', 'n1')
    s = reduceLine(s, synthetic('Set model to Sonnet 5.5'))
    s = feed([{ duration_ms: 40, subtype: 'success', total_cost_usd: 0, type: 'result' }], s)
    expect(s.turns).toEqual([
      { blocks: [{ kind: 'note', text: 'Model → Sonnet 5.5' }], id: 'n1', role: 'assistant' },
    ])
    expect(s.model).toBe('Sonnet 5.5')
  })

  test('a second change of the same kind replaces the line; another kind adds one', () => {
    let s = addNote(initialChat, 'Intelligence → Low', 'n1')
    s = addNote(s, 'Intelligence → High', 'n2')
    s = addNote(s, 'Model → Haiku 5.5', 'n3')
    expect(s.turns.map((t) => t.blocks[0])).toEqual([
      { kind: 'note', text: 'Intelligence → High' },
      { kind: 'note', text: 'Model → Haiku 5.5' },
    ])
  })
})

test('Read output becomes numbered lines; anything else stays as it came', () => {
  expect(numberedLines('1\timport x\n2\t\n3\t  y')).toEqual([
    { n: '1', text: 'import x' },
    { n: '2', text: '' },
    { n: '3', text: '  y' },
  ])
  expect(numberedLines('    9→a\n   10→b\n')).toEqual([
    { n: '9', text: 'a' },
    { n: '10', text: 'b' },
  ])
  expect(numberedLines('File does not exist.')).toBeNull()
  expect(numberedLines('')).toBeNull()
})

test('a failed command keeps its output and gives its exit code apart', () => {
  expect(exitCode('rg: unrecognized file type: tsx\nexit code 2')).toEqual({
    body: 'rg: unrecognized file type: tsx',
    code: 2,
  })
  expect(exitCode('Error: Exit code 1\nboom')).toEqual({ body: 'boom', code: 1 })
  expect(exitCode('all good')).toEqual({ body: 'all good', code: null })
})

describe('pasted images', () => {
  const png = { data: 'iVBORw0KGgo=', mediaType: 'image/png' }

  test('go to Claude before the words, as base64 image blocks', () => {
    expect(JSON.parse(userLine('what is this?', null, undefined, [png])).message.content).toEqual([
      { source: { data: png.data, media_type: 'image/png', type: 'base64' }, type: 'image' },
      { text: 'what is this?', type: 'text' },
    ])
    // Images alone: no empty text block.
    expect(JSON.parse(userLine('', null, undefined, [png])).message.content).toHaveLength(1)
  })

  test('show over the prompt; images alone make a prompt too', () => {
    const turn = addUserTurn(initialChat, 'look', 'u1', [png]).turns[0]
    expect(turn?.blocks).toEqual([
      { kind: 'image', ...png },
      { kind: 'text', text: 'look' },
    ])
    expect(addUserTurn(initialChat, '', 'u2', [png]).turns[0]?.blocks).toEqual([
      { kind: 'image', ...png },
    ])
  })

  test('a slash with an image is a prompt, not a command', () => {
    const blocks = addUserTurn(initialChat, '/context', 'u1', [png]).turns[0]?.blocks
    expect(blocks?.at(-1)).toEqual({ kind: 'text', text: '/context' })
  })

  test('come back in another window and from the transcript', () => {
    const sent = JSON.parse(userLine('', null, undefined, [png]))
    const live = reduceLine(initialChat, JSON.stringify({ message: sent, type: 'aimux_sent' }))
    expect(live.turns[0]?.blocks).toEqual([{ kind: 'image', ...png }])

    const line = JSON.stringify({ message: sent.message, type: 'user', uuid: 'a' })
    expect(replayTranscript([line]).turns[0]?.blocks).toEqual([{ kind: 'image', ...png }])
  })
})

const URL_A = 'https://claude.ai/artifact/Q7qKRZLjujn7avFRs7C3Bv'
const publish = (
  id: string,
  input: Record<string, unknown>,
  result?: { text: string; isError: boolean }
): Block => ({ id, input, json: '', kind: 'tool', name: 'Artifact', result })
const done = (text: string) => ({ isError: false, text })

test('a claude.ai artifact link is found in a publish result, either shape', () => {
  expect(artifactUrl(`Published /tmp/x.html at ${URL_A} (Version 1, version id 1-2)`)).toBe(URL_A)
  expect(artifactUrl('at https://claude.ai/code/artifact/0b9e-77aa.')).toBe(
    'https://claude.ai/code/artifact/0b9e-77aa'
  )
  expect(artifactUrl('Quickstart. Make a plain page.')).toBeNull()
})

test('a publish with a link gives its url and title', () => {
  const blocks = [publish('t1', { file_path: '/tmp/p.html', title: 'Flow' }, done(`at ${URL_A}`))]
  expect(publishedArtifacts(blocks)).toEqual([{ title: 'Flow', toolId: 't1', url: URL_A }])
})

test('ignores calls without a published URL', () => {
  const blocks = [
    publish('q', { action: 'quickstart', intent: 'other' }, done('Quickstart. See …')),
    publish('l', { action: 'list' }, done(`1 artifact: ${URL_A}`)),
    publish('e', { file_path: '/tmp/p.html' }, { isError: true, text: `failed for ${URL_A}` }),
    publish('r', { file_path: '/tmp/p.html' }),
  ]
  expect(publishedArtifacts(blocks)).toEqual([])
})

test('an open call counts, and a missing title is empty', () => {
  const blocks = [publish('o', { action: 'open', url: URL_A }, done(`Opened ${URL_A}`))]
  expect(publishedArtifacts(blocks)).toEqual([{ title: '', toolId: 'o', url: URL_A }])
})

test('republish yields the same url once, with the last title', () => {
  const blocks = [
    publish('a', { file_path: '/tmp/p.html', title: 'v1' }, done(`at ${URL_A}`)),
    publish('b', { file_path: '/tmp/p.html', title: 'v2' }, done(`at ${URL_A}`)),
  ]
  expect(publishedArtifacts(blocks)).toEqual([{ title: 'v2', toolId: 'b', url: URL_A }])
})

test('only publishes that completed since the last state are new', () => {
  const pending = publish('a', { file_path: '/tmp/p.html', title: 'Flow' })
  const finished = publish('a', { file_path: '/tmp/p.html', title: 'Flow' }, done(`at ${URL_A}`))
  expect(newPublishes([pending], [finished])).toEqual([{ title: 'Flow', toolId: 'a', url: URL_A }])
  expect(newPublishes([finished], [finished])).toEqual([])
  const again = publish('b', { file_path: '/tmp/p.html' }, done(`at ${URL_A}`))
  expect(newPublishes([finished], [finished, again])).toEqual([
    { title: '', toolId: 'b', url: URL_A },
  ])
})

describe('compacting', () => {
  const status = (s: string | null) => ({ status: s, subtype: 'status', type: 'system' })

  test('Claude Code saying it compacts shows until it is done', () => {
    const s = feed([status('compacting')])
    expect(s.compacting).toBe(true)
    expect(liveStep(s, '/w').verb).toBe('Compacting the conversation')
    expect(feed([status(null)], s).compacting).toBe(false)
    expect(feed([{ subtype: 'compact_boundary', type: 'system' }], s).compacting).toBe(false)
  })

  test("a reopened chat never shows the compaction's summary as a prompt", () => {
    const summary = {
      isCompactSummary: true,
      isVisibleInTranscriptOnly: true,
      message: {
        content: 'This session is being continued from a previous conversation…',
        role: 'user',
      },
      type: 'user',
      uuid: 'sum',
    }
    const s = replayTranscript([JSON.stringify(summary)])
    expect(s.turns).toEqual([])
  })
})
