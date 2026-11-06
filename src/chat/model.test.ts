import { describe, expect, test } from 'bun:test'

import {
  addNote,
  addUserTurn,
  type ChatState,
  exitCode,
  initialChat,
  modelSet,
  numberedLines,
  parseCommands,
  type Permission,
  permissionLine,
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

const ev = (event: unknown) => ({ event, parent_tool_use_id: null, type: 'stream_event' })

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

  test('sub-agent traffic stays out of the conversation', () => {
    const s = feed([
      {
        message: { content: [{ text: 'x', type: 'text' }], id: 'm2' },
        parent_tool_use_id: 't1',
        type: 'assistant',
      },
    ])
    expect(s.turns).toEqual([])
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
