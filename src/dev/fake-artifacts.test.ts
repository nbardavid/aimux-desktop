import { expect, test } from 'bun:test'

import { fakeArtifacts } from './fake-artifacts'

test('fake artifacts: as many as asked, distinct pages, newest unread', () => {
  const fakes = fakeArtifacts(10, 1_000_000_000)
  expect(fakes).toHaveLength(10)
  expect(new Set(fakes.map((a) => a.url)).size).toBe(10)
  expect(fakes.every((a) => a.url.startsWith('https://'))).toBe(true)
  expect(fakes.some((a) => a.seenAt == null)).toBe(true)
  expect(fakeArtifacts(3, 0)).toHaveLength(3)
  expect(fakeArtifacts(0, 0)).toEqual([])
})
