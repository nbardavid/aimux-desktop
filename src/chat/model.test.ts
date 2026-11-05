import { describe, expect, test } from 'bun:test'

import {
  addUserTurn,
  type ChatState,
  initialChat,
  permissionLine,
  reduceLine,
  toolSummary,
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
    const asked = feed([
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
    ])
    expect(asked.pending).toHaveLength(1)
    const done = feed(
      [{ duration_ms: 1200, subtype: 'success', total_cost_usd: 0.01, type: 'result' }],
      asked
    )
    expect(done).toMatchObject({
      lastTurn: { costUsd: 0.01, durationMs: 1200 },
      pending: [],
      status: 'idle',
    })
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
})

describe('permissionLine', () => {
  const p = {
    description: null,
    input: { a: 1 },
    requestId: 'r1',
    suggestions: [{ x: 1 }],
    toolName: 'Write',
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
