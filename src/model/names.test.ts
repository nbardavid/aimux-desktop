import { expect, test } from 'bun:test'

import { COLORS, nameCandidates } from './names'

test('candidates are every colour not taken, each once', () => {
  const names = nameCandidates(['amber'])
  expect(names).not.toContain('amber')
  expect(new Set(names).size).toBe(Object.keys(COLORS).length - 1)
})
