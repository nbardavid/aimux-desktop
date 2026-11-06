import { describe, expect, test } from 'bun:test'

import {
  addNote,
  addUserTurn,
  type Block,
  changedFiles,
  exchanges,
  formatDuration,
  groupSummary,
  initialChat,
  type Item,
  reduceLine,
  replayTranscript,
  sendTurn,
  type Turn,
} from './model'

const text = (t: string): Block => ({ kind: 'text', text: t })
const tool = (name: string, input: Record<string, unknown> = {}, isError = false): Block => ({
  id: name,
  input,
  json: '',
  kind: 'tool',
  name,
  result: { isError, text: '' },
})
const thinking = (t: string): Block => ({ kind: 'thinking', text: t })
const user = (id: string): Turn => ({ blocks: [text(id)], id, role: 'user' })
const said = (id: string, blocks: Block[], end = true): Turn => ({
  blocks,
  id,
  role: 'assistant',
  ...(end ? { end: { costUsd: 0.1, durationMs: 1000, stopped: false } } : {}),
})

/** An item as a short string: `G2` a group of two (`G2+1` with one row kept out), `text`… */
const shape = (items: Item[]) =>
  items.map((i) =>
    i.kind === 'group' ? `G${i.blocks.length}${i.shown > 0 ? `+${i.shown}` : ''}` : i.block.kind
  )

describe('the collapse rule', () => {
  test('answer last: the work before it folds into one row', () => {
    const turns = [
      user('u'),
      said('a1', [thinking('hm'), tool('Read'), text('looking')], false),
      said('a2', [tool('Edit'), tool('Bash'), text('Done.')]),
    ]
    const [ex] = exchanges(turns, false)
    expect(shape(ex?.items ?? [])).toEqual(['G5', 'text'])
    expect(ex?.answer).toBe('Done.')
    expect(ex?.end).toMatchObject({ costUsd: 0.1 })
  })

  test('answer first, then tools (a stopped turn): one row below the answer', () => {
    const [ex] = exchanges(
      [user('u'), said('a', [text('On it.'), tool('Bash'), tool('Bash')])],
      false
    )
    expect(shape(ex?.items ?? [])).toEqual(['text', 'G2'])
  })

  test('tools only: everything folds into one row', () => {
    const [ex] = exchanges([user('u'), said('a', [tool('Read'), tool('Grep')])], false)
    expect(shape(ex?.items ?? [])).toEqual(['G2'])
    expect(ex?.answer).toBe('')
  })

  test('live: everything folds but the newest tool and the message after it', () => {
    const running: Block = { id: 'r', input: {}, json: '', kind: 'tool', name: 'Bash' }
    const turns = [user('u'), said('a', [tool('Read'), text('hm'), running], false)]
    const [ex] = exchanges(turns, true)
    expect(ex?.live).toBe(true)
    expect(shape(ex?.items ?? [])).toEqual(['G3+1'])
    const writing = [...turns.slice(0, 1), said('a', [tool('Read'), running, text('So')], false)]
    const [now] = exchanges(writing, true)
    expect(shape(now?.items ?? [])).toEqual(['G2+1', 'text'])
    // The group keeps its key once finished, so its open state stays.
    const ran: Block = { ...running, result: { isError: false, text: '' } }
    const [done] = exchanges([user('u'), said('a', [tool('Read'), ran, text('So')], false)], false)
    expect(done?.items[0]?.key).toBe(now?.items[0]?.key)
    expect(shape(done?.items ?? [])).toEqual(['G2', 'text'])
  })

  test('a tool still waiting keeps its exchange live, its row open, after a note', () => {
    const running: Block = { id: 'r', input: {}, json: '', kind: 'tool', name: 'Bash' }
    const turns = [
      user('u'),
      said('a', [text('Running the tests.'), tool('Read'), running], false),
      { blocks: [{ kind: 'note', text: 'Model → Sonnet 5.5' }], id: 'n', role: 'assistant' },
    ] satisfies Turn[]
    const [ex, note] = exchanges(turns, false)
    expect(ex?.live).toBe(true)
    expect(shape(ex?.items ?? [])).toEqual(['G3+1'])
    expect(note?.live).toBe(false)
    // Waiting on a permission: live too, even with a result already in (a replayed answer).
    const asked: Block = { ...running, result: { isError: false, text: '' } }
    const [waiting] = exchanges([user('u'), said('a', [asked], false)], false, new Set(['r']))
    expect(waiting?.live).toBe(true)
    expect(shape(waiting?.items ?? [])).toEqual(['G1+1'])
    // A stopped tool waits on nothing.
    const [stopped] = exchanges([user('u'), said('a', [{ ...running, stopped: true }])], false)
    expect(stopped?.live).toBe(false)
  })

  test('a finished exchange is not live, even while the next one starts', () => {
    const exs = exchanges([user('u1'), said('a', [text('ok')]), user('u2')], true)
    expect(exs.map((e) => e.live)).toEqual([false, true])
  })

  test('cards and notes never fold; a note stands alone', () => {
    let s = addUserTurn(initialChat, '/context', 'u')
    s = reduceLine(
      s,
      JSON.stringify({
        message: { content: [{ text: '## Context', type: 'text' }], id: 'm', model: '<synthetic>' },
        type: 'assistant',
      })
    )
    s = addNote(s, 'Model → Sonnet 5.5', 'n')
    const exs = exchanges(s.turns, false)
    expect(exs.map((e) => shape(e.items))).toEqual([['output'], ['note']])
    expect(exs[0]?.answer).toBe('## Context')
    expect(exs[1]?.user).toBeNull()
  })

  test('empty thinking shows nothing', () => {
    const [ex] = exchanges([user('u'), said('a', [thinking(''), text('hi')])], false)
    expect(shape(ex?.items ?? [])).toEqual(['text'])
  })
})

test('group labels pluralise, count failures, and list up to 4 kinds in order', () => {
  expect(groupSummary([tool('Read')]).label).toBe('1 tool call')
  expect(groupSummary([tool('Read'), tool('Bash'), text('a')]).label).toBe(
    '2 tool calls, 1 message'
  )
  expect(groupSummary([text('a'), text('b')]).label).toBe('2 messages')
  expect(groupSummary([thinking('x')])).toEqual({
    failed: 0,
    kinds: ['thinking'],
    label: 'Thought',
  })
  const mixed = [
    tool('Bash', {}, true),
    tool('Read'),
    tool('Grep'),
    thinking('x'),
    tool('mcp__x__y'),
    tool('WebFetch'),
    tool('Task'),
  ]
  expect(groupSummary(mixed)).toMatchObject({
    failed: 1,
    kinds: ['bash', 'read', 'thinking', 'web'],
    label: '6 tool calls',
  })
})

test('changed files come from Edit, Write and MultiEdit, by path, relative to the workspace', () => {
  const blocks = [
    tool('Edit', { file_path: '/w/src/a.ts', new_string: 'x\ny\nz', old_string: 'x' }),
    tool('Write', { content: 'one\ntwo\n', file_path: '/w/README.md' }),
    tool('MultiEdit', {
      edits: [
        { new_string: 'b', old_string: 'a\nb' },
        { new_string: '', old_string: 'c' },
      ],
      file_path: '/w/src/a.ts',
    }),
    tool('Edit', { file_path: '/w/failed.ts', new_string: 'x', old_string: 'y' }, true),
    tool('Read', { file_path: '/w/src/b.ts' }),
    tool('NotebookEdit', { new_source: 'print(1)', notebook_path: '/elsewhere/n.ipynb' }),
  ]
  expect(changedFiles(blocks, '/w')).toEqual([
    { added: 4, path: 'src/a.ts', removed: 4 },
    { added: 2, path: 'README.md', removed: 0 },
    { added: 1, path: '/elsewhere/n.ipynb', removed: 0 },
  ])
})

test('durations read as 12s, 2m 4s, 1h 3m', () => {
  expect(formatDuration(400)).toBe('1s')
  expect(formatDuration(12_300)).toBe('12s')
  expect(formatDuration(124_000)).toBe('2m 4s')
  expect(formatDuration(3_780_000)).toBe('1h 3m')
})

describe('a replayed exchange ends', () => {
  const line = (v: unknown) => JSON.stringify(v)
  const prompt = (uuid: string, t: string, at: string) =>
    line({ message: { content: t, role: 'user' }, timestamp: at, type: 'user', uuid })
  const answer = (id: string, t: string, at: string) =>
    line({
      message: { content: [{ text: t, type: 'text' }], id },
      timestamp: at,
      type: 'assistant',
    })

  test('with its length from the timestamps and no cost', () => {
    const s = replayTranscript([
      prompt('u1', 'go', '2026-11-06T10:00:00Z'),
      answer('m1', 'done', '2026-11-06T10:02:04Z'),
      prompt('u2', 'again', '2026-11-06T11:00:00Z'),
      answer('m2', 'ok', '2026-11-06T11:00:12Z'),
    ])
    expect(s.turns.map((t) => t.end?.durationMs)).toEqual([undefined, 124_000, undefined, 12_000])
    expect(s.turns[1]?.end).toEqual({ costUsd: 0, durationMs: 124_000, stopped: false })
  })

  test('as stopped when Esc interrupted it, with no bubble for the marker', () => {
    const s = replayTranscript([
      prompt('u1', 'go', '2026-11-06T10:00:00Z'),
      answer('m1', 'starting', '2026-11-06T10:00:03Z'),
      line({
        message: {
          content: [{ text: '[Request interrupted by user]', type: 'text' }],
          role: 'user',
        },
        timestamp: '2026-11-06T10:00:04Z',
        type: 'user',
      }),
      prompt('u2', 'next', '2026-11-06T10:01:00Z'),
    ])
    expect(s.turns.map((t) => t.role)).toEqual(['user', 'assistant', 'user'])
    expect(s.turns[1]?.end?.stopped).toBe(true)
    expect(s.turns[2]?.end?.stopped).toBe(false)
  })
})

describe('a prompt sent while Claude works', () => {
  const say = (id: string, t: string) =>
    JSON.stringify({ message: { content: [{ text: t, type: 'text' }], id }, type: 'assistant' })
  const result = JSON.stringify({
    duration_ms: 10,
    subtype: 'success',
    total_cost_usd: 0,
    type: 'result',
  })

  /** What Claude Code says as it starts a prompt. */
  const took = (uuid: string) =>
    JSON.stringify({ command_uuid: uuid, state: 'started', type: 'command_lifecycle' })
  const ack = (requestId: string) =>
    JSON.stringify({
      response: { request_id: requestId, response: { still_queued: [] }, subtype: 'success' },
      type: 'control_response',
    })
  const working = () => {
    const init = JSON.stringify({ session_id: 's', subtype: 'init', type: 'system' })
    const s = sendTurn(reduceLine(initialChat, init), 'Run the tests', 'u1')
    return reduceLine(reduceLine(s, took('u1')), say('m1', 'Running them.'))
  }

  test('wait above the composer until Claude takes them, then read as one prompt', () => {
    let s = sendTurn(working(), 'also check lint', 'u2')
    s = sendTurn(s, 'and format', 'u3')
    expect(s.queued.map((t) => t.id)).toEqual(['u2', 'u3'])
    expect(s.turns.map((t) => t.id)).toEqual(['u1', 'm1'])
    s = reduceLine(s, say('m1b', 'All 86 pass.'))
    // The result alone moves nothing: Claude has not taken them yet.
    s = reduceLine(s, result)
    expect(s.status).toBe('working')
    expect(s.queued).toHaveLength(2)
    s = reduceLine(s, took('u2'))
    s = reduceLine(s, took('u3'))
    expect(s.queued).toEqual([])
    expect(s.turns.at(-1)?.blocks).toEqual([
      { kind: 'text', text: 'also check lint\n\nand format' },
    ])
    s = reduceLine(s, say('m2', 'Lint is clean, formatted.'))
    s = reduceLine(s, result)
    expect(s.status).toBe('idle')
    const exs = exchanges(s.turns, false)
    expect(exs.map((e) => [e.user?.id, e.answer])).toEqual([
      ['u1', 'All 86 pass.'],
      ['u2', 'Lint is clean, formatted.'],
    ])
  })

  test('taken mid-turn, at a tool call: the turn answers them, one result ends it', () => {
    let s = sendTurn(working(), 'say APPLE', 'u2')
    s = reduceLine(s, took('u2'))
    expect(s.turns.map((t) => t.id)).toEqual(['u1', 'm1', 'u2'])
    s = reduceLine(s, say('m2', 'APPLE'))
    s = reduceLine(s, result)
    expect(s.status).toBe('idle')
    expect(s.queued).toEqual([])
  })

  test('a slash command stays its own prompt', () => {
    let s = sendTurn(working(), '/context', 'u2')
    s = sendTurn(s, 'say BANANA', 'u3')
    s = reduceLine(s, took('u3'))
    expect(s.queued.map((t) => t.id)).toEqual(['u2'])
    s = reduceLine(s, result)
    expect(s.status).toBe('working')
    s = reduceLine(s, took('u2'))
    expect(s.turns.at(-1)?.blocks[0]?.kind).toBe('command')
  })

  test('a stop with nothing running ends on its acknowledgement, not a result', () => {
    // A prompt shown as running that Claude never ran: Esc must not hang on "Stopping…".
    let s = { ...working(), running: false, stopping: true }
    s = sendTurn(s, 'never taken', 'u2')
    s = reduceLine(s, ack('stop-1'))
    expect(s.stopping).toBe(false)
    expect(s.status).toBe('idle')
    expect(s.queued).toEqual([])
    expect(s.turns.at(-1)?.id).toBe('u2')
  })

  test('a stop with a turn running waits for its result', () => {
    let s = { ...working(), stopping: true }
    s = reduceLine(s, ack('stop-1'))
    expect(s.stopping).toBe(true)
    s = reduceLine(s, JSON.stringify({ subtype: 'error_during_execution', type: 'result' }))
    expect(s.stopping).toBe(false)
    expect(s.status).toBe('idle')
    expect(s.errors).toEqual([])
  })

  test('a Claude that never reports its prompts takes them all at its result', () => {
    let s = sendTurn({ ...initialChat, status: 'idle' }, 'one', 'u1')
    s = sendTurn(s, 'two', 'u2')
    s = sendTurn(s, 'three', 'u3')
    s = reduceLine(s, say('m1', 'Done.'))
    s = reduceLine(s, result)
    expect(s.status).toBe('working')
    expect(s.queued).toEqual([])
    expect(s.turns.at(-1)?.blocks).toEqual([{ kind: 'text', text: 'two\n\nthree' }])
  })

  test('a Claude that exits leaves the queued prompts in the transcript', () => {
    let s = sendTurn({ ...initialChat, status: 'idle' }, 'one', 'u1')
    s = sendTurn(s, 'two', 'u2')
    s = reduceLine(s, JSON.stringify({ type: 'aimux_exit' }))
    expect(s.turns.map((t) => t.id)).toEqual(['u1', 'u2'])
    expect(s.queued).toEqual([])
  })
})
