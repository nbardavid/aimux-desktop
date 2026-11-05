import { expect, test } from 'bun:test'

import { slugify, suggestName } from './names'

test('slugify keeps what a branch name can carry', () => {
  expect(slugify('  Fix Login Bug! ')).toBe('fix-login-bug')
  expect(slugify('v2.1 release')).toBe('v2-1-release')
})

test('suggestName never repeats a taken name', () => {
  expect(suggestName(['amber'], () => 0)).toBe('aspen')
  expect(suggestName(['Amber '], () => 0)).toBe('aspen')
})
