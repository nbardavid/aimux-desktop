import { expect, test } from 'bun:test'

import { DEFAULT_FONT, fontFrom } from './terminal-font'

test('a named font goes first, the default behind it; a bad size is the default', () => {
  expect(fontFrom({})).toEqual({ family: DEFAULT_FONT, size: 12.5 })
  expect(
    fontFrom({ 'terminal.fontFamily': ' JetBrainsMono Nerd Font ', 'terminal.fontSize': 14 })
  ).toEqual({
    family: `"JetBrainsMono Nerd Font", ${DEFAULT_FONT}`,
    size: 14,
  })
  expect(fontFrom({ 'terminal.fontSize': 'big' }).size).toBe(12.5)
})
