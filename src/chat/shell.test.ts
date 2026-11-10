import { expect, test } from 'bun:test'

import { addShellTurn, initialChat, reduceLine, replayTranscript, shellContextLine } from './model'
import { shellOutput, shellsDone } from './shell'

const row = (content: string) =>
  JSON.stringify({ isReplay: true, message: { content, role: 'user' }, type: 'user' })

test('a ! command shows at once, then what it printed; its echo adds nothing', () => {
  const sent = addShellTurn(initialChat, 'ls && pwd', 'u1')
  expect(sent.turns.at(-1)?.blocks[0]).toEqual({
    command: 'ls && pwd',
    exitCode: null,
    kind: 'shell',
    output: null,
  })
  const echoed = reduceLine(sent, row('<bash-input>ls &amp;&amp; pwd</bash-input>'))
  expect(echoed.turns).toEqual(sent.turns)
  const done = reduceLine(
    echoed,
    row(
      '<bash-stdout>a.ts\n/repo</bash-stdout><bash-stderr></bash-stderr><bash-exit-code>0</bash-exit-code>'
    )
  )
  expect(done.turns.at(-1)?.blocks[0]).toMatchObject({ exitCode: 0, output: 'a.ts\n/repo' })
  expect(shellsDone(sent, done).map((b) => b.command)).toEqual(['ls && pwd'])
  expect(shellsDone(done, done)).toEqual([])
})

test('stderr follows stdout, and a failure keeps its exit code', () => {
  expect(
    shellOutput(
      '<bash-stdout>out\n</bash-stdout><bash-stderr>boom</bash-stderr><bash-exit-code>2</bash-exit-code>'
    )
  ).toEqual({ exitCode: 2, output: 'out\nboom' })
})

test('a ! command comes back from the transcript as one card', () => {
  const lines = [
    JSON.stringify({
      message: { content: '<bash-input>git status</bash-input>\n<bash-stdout>clean</bash-stdout>' },
      type: 'user',
      uuid: 's1',
    }),
  ]
  const blocks = replayTranscript(lines).turns.map((t) => t.blocks[0])
  expect(blocks).toEqual([
    { command: 'git status', exitCode: null, kind: 'shell', output: 'clean' },
  ])
})

test('a result without a turn (the output told to Claude) ends nothing', () => {
  const idle = addShellTurn(initialChat, 'ls', 'u1')
  const after = reduceLine(
    idle,
    JSON.stringify({ num_turns: 0, result: '', subtype: 'success', type: 'result' })
  )
  expect(after).toBe(idle)
})

test('Claude is told of the command without a turn', () => {
  const line = JSON.parse(shellContextLine('ls', 'a.ts', 1)) as Record<string, unknown>
  expect(line.shouldQuery).toBe(false)
  expect((line.message as { content: string }).content).toBe(
    '<bash-input>ls</bash-input>\n<bash-stdout>a.ts</bash-stdout><bash-stderr></bash-stderr><bash-exit-code>1</bash-exit-code>'
  )
})
