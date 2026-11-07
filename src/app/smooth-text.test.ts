import { expect, test } from 'bun:test'

import { nextShown } from './smooth-text'

test('a burst is revealed over a few frames, never past the text, never stalling', () => {
  let shown = 0
  const frames: number[] = []
  while (shown < 600 && frames.length < 100) frames.push((shown = nextShown(shown, 600, 16)))
  expect(frames[0]).toBeGreaterThan(1)
  expect(frames[0]).toBeLessThan(600)
  expect(frames.length).toBeLessThan(60)
  expect(nextShown(600, 600, 16)).toBe(600)
  expect(nextShown(599, 600, 16)).toBe(600)
})
