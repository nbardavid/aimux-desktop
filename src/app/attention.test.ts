import { expect, test } from 'bun:test'

import { shouldPlayNow } from './attention'

test('one sound per 700ms, however many chats finish at once', () => {
  expect(shouldPlayNow(1000, Number.NEGATIVE_INFINITY)).toBe(true)
  expect(shouldPlayNow(1500, 1000)).toBe(false)
  expect(shouldPlayNow(1700, 1000)).toBe(true)
})
