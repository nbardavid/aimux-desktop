import { expect, test } from 'bun:test'

import { earlier, firstShown, PAGE } from './use-window'

test('a long chat opens on its last page', () => {
  expect(firstShown(null, 0)).toBe(0)
  expect(firstShown(null, 5)).toBe(0)
  expect(firstShown(null, 100)).toBe(100 - PAGE)
})

test('once fixed, the start stays: new exchanges extend the window at the end', () => {
  expect(firstShown(80, 103)).toBe(80)
  expect(firstShown(80, 50)).toBe(50)
})

test('scrolling up brings the page before, down to the first exchange', () => {
  expect(earlier(80)).toBe(80 - PAGE)
  expect(earlier(7)).toBe(0)
})
