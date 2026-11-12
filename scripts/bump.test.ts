import { expect, test } from 'bun:test'

import { nextVersion, updateManifest } from './bump'

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

test('the update manifest points both macOS targets at the signed archive', () => {
  const manifest = updateManifest('0.3.0', 'SIG', '2026-11-06T00:00:00.000Z')
  const target = {
    signature: 'SIG',
    url: 'https://github.com/nbardavid/logit/releases/download/v0.3.0/logit_aarch64.app.tar.gz',
  }
  expect(manifest).toEqual({
    notes: '',
    platforms: { 'darwin-aarch64': target, 'darwin-aarch64-app': target },
    pub_date: '2026-11-06T00:00:00.000Z',
    version: '0.3.0',
  })
})
