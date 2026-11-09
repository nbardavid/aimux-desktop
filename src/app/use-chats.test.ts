import { describe, expect, test } from 'bun:test'

import { historyBefore, historyLength, titleOf } from './use-chats'

test('a first prompt names its tab: whole when short, else cut at a word with an ellipsis', () => {
  expect(titleOf('  Fix   the\ntabs ')).toBe('Fix the tabs')
  expect(titleOf('Sessions from this workspace should come first in /resume.')).toBe(
    'Sessions from this workspace should…'
  )
  expect(titleOf('x'.repeat(60))).toBe(`${'x'.repeat(39)}…`)
})

describe('historyBefore', () => {
  const main = (n: number) => JSON.stringify({ type: 'user', uuid: `m${n}` })
  const agent = JSON.stringify({ aimuxAgent: 't1', type: 'assistant' })

  test("the host's count is of the session's own lines: the sub-agents' never shift the cut", () => {
    // Started with 2 lines and 1 sub-agent line; 2 more were written since.
    const history = [main(1), main(2), main(3), main(4), agent]
    expect(historyLength(history)).toBe(4)
    expect(historyBefore(history, 2)).toEqual([main(1), main(2), agent])
  })
})
