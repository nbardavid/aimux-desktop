import { expect, test } from 'bun:test'

import type { Update } from './update-button'

import { restartWarning, restoreLabel, updateStatus } from './settings-view'

test('the restart confirm says what it pauses and closes', () => {
  expect(restartWarning(1, 1)).toBe('Click again: pauses 1 working chat, closes 1 terminal')
  expect(restartWarning(2, 0)).toBe('Click again: pauses 2 working chats')
  expect(restartWarning(0, 3)).toBe('Click again: closes 3 terminals')
  expect(restartWarning(0, 0)).toBe('Click again to restart')
})

test('Restore defaults asks again, saying how many it resets', () => {
  expect(restoreLabel(3, false)).toBe('Restore defaults')
  expect(restoreLabel(1, true)).toBe('Restore 1 setting?')
  expect(restoreLabel(3, true)).toBe('Restore 3 settings?')
})

const idle: Update = {
  check: () => {},
  checkedAt: null,
  checkError: null,
  checking: false,
  error: null,
  install: () => {},
  installing: false,
  version: null,
}

test('About says where the update stands, an offer before a failed check', () => {
  expect(updateStatus(idle, true).text).toBe('This dev build never updates itself.')
  expect(updateStatus({ ...idle, checking: true }, false).text).toBe('Checking for updates…')
  expect(updateStatus({ ...idle, checkedAt: 1 }, false).text).toBe('Up to date.')
  expect(updateStatus({ ...idle, checkError: 'offline' }, false)).toEqual({
    failed: true,
    text: 'offline',
  })
  const offer = updateStatus({ ...idle, checkError: 'offline', version: '0.3.0' }, false)
  expect(offer.failed).toBe(false)
  expect(offer.text).toStartWith('0.3.0 is out.')
  expect(updateStatus({ ...idle, error: 'bad signature', version: '0.3.0' }, false)).toEqual({
    failed: true,
    text: 'bad signature',
  })
})
