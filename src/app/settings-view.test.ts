import { expect, test } from 'bun:test'

import { resetShown, restartWarning } from './settings-view'

test('the restart confirm says what it pauses and closes', () => {
  expect(restartWarning(1, 1)).toBe('Click again: pauses 1 working chat, closes 1 terminal')
  expect(restartWarning(2, 0)).toBe('Click again: pauses 2 working chats')
  expect(restartWarning(0, 3)).toBe('Click again: closes 3 terminals')
  expect(restartWarning(0, 0)).toBe('Click again to restart')
})

test('Reset shows while a value differs from its default, on hover when stored as it', () => {
  expect(resetShown(undefined, true, true)).toBe('never')
  expect(resetShown(false, true, false)).toBe('always')
  expect(resetShown(true, true, true)).toBe('hover')
  expect(resetShown('.env, .npmrc', '.env', '.env, .npmrc')).toBe('always')
})
