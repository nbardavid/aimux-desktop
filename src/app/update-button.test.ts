import { expect, test } from 'bun:test'

import { dueOnFocus } from './update-button'

test('coming back to the window checks again after ten minutes, not before', () => {
  expect(dueOnFocus(null, 0)).toBe(true)
  expect(dueOnFocus(0, 9 * 60 * 1000)).toBe(false)
  expect(dueOnFocus(0, 10 * 60 * 1000)).toBe(true)
})
