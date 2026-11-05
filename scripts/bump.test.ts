import { expect, test } from 'bun:test'

import { nextVersion } from './bump'

test('patch, minor and major step from the current version', () => {
  expect(nextVersion('0.1.9', 'patch')).toBe('0.1.10')
  expect(nextVersion('0.1.9', 'minor')).toBe('0.2.0')
  expect(nextVersion('0.1.9', 'major')).toBe('1.0.0')
})

test('an exact version is taken as is', () => {
  expect(nextVersion('0.1.9', '0.3.0')).toBe('0.3.0')
})

test('anything else is refused', () => {
  expect(nextVersion('0.1.9', 'huge')).toBeNull()
  expect(nextVersion('0.1.9', '')).toBeNull()
})
