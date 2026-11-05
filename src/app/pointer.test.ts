import { expect, test } from 'bun:test'

import { pointerMoved } from './pointer'

test('a mousemove at the same spot (a list scrolled under the cursor) is not a move', () => {
  expect(pointerMoved({ clientX: 10, clientY: 20 })).toBe(true)
  expect(pointerMoved({ clientX: 10, clientY: 20 })).toBe(false)
  expect(pointerMoved({ clientX: 10, clientY: 21 })).toBe(true)
})
