import { expect, test } from 'bun:test'

import { titleOf } from './use-chats'

test('a first prompt names its tab: whole when short, else cut at a word with an ellipsis', () => {
  expect(titleOf('  Fix   the\ntabs ')).toBe('Fix the tabs')
  expect(titleOf('Sessions from this workspace should come first in /resume.')).toBe(
    'Sessions from this workspace should…'
  )
  expect(titleOf('x'.repeat(60))).toBe(`${'x'.repeat(39)}…`)
})
