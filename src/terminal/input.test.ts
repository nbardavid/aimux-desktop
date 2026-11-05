import { expect, test } from 'bun:test'

import { encodeKey, encodePaste, encodeWheel, type KeyLike, wheelLines, wheelMode } from './input'

const key = (k: string, mods: Partial<KeyLike> = {}): KeyLike => ({
  altKey: false,
  ctrlKey: false,
  key: k,
  metaKey: false,
  shiftKey: false,
  ...mods,
})

test('printable', () => {
  expect(encodeKey(key('a'))).toBe('a')
  expect(encodeKey(key('A', { shiftKey: true }))).toBe('A')
  expect(encodeKey(key('é'))).toBe('é')
})

test('enter and shift+enter', () => {
  expect(encodeKey(key('Enter'))).toBe('\r')
  expect(encodeKey(key('Enter', { shiftKey: true }))).toBe('\x1b\r')
})

test('shift+tab', () => expect(encodeKey(key('Tab', { shiftKey: true }))).toBe('\x1b[Z'))

test('ctrl, alt and arrows', () => {
  expect(encodeKey(key('c', { ctrlKey: true }))).toBe('\x03')
  expect(encodeKey(key('b', { altKey: true }))).toBe('\x1bb')
  expect(encodeKey(key('ArrowUp'))).toBe('\x1b[A')
  expect(encodeKey(key('Backspace', { altKey: true }))).toBe('\x1b\x7f')
})

test('option-composed characters are typed as-is', () => {
  expect(encodeKey(key('[', { altKey: true, shiftKey: true }))).toBe('[')
})

test('cmd is left to the app', () => {
  expect(encodeKey(key('c', { metaKey: true }))).toBeNull()
  expect(encodeKey(key('Shift', { shiftKey: true }))).toBeNull()
  expect(encodeKey(key('Dead'))).toBeNull()
})

test('bracketed paste wraps', () => {
  expect(encodePaste('hi', true)).toBe('\x1b[200~hi\x1b[201~')
})

test('plain paste untouched', () => expect(encodePaste('hi', false)).toBe('hi'))

test('paste newlines become carriage returns', () => {
  expect(encodePaste('a\nb\r\nc', false)).toBe('a\rb\rc')
})

test('paste cannot close the bracket early', () => {
  for (const text of ['a\x1b[201~b', 'a\x1b[20\x1b[201~1~b']) {
    const out = encodePaste(text, true)
    expect(out.split('\x1b[201~')).toHaveLength(2)
    expect(out.endsWith('\x1b[201~')).toBe(true)
  }
})

test('wheel pixels to lines', () => {
  expect(wheelLines(60, 0, 20)).toBe(3)
  expect(wheelLines(-60, 0, 20)).toBe(-3)
})

test('wheel lines mode', () => expect(wheelLines(2, 1, 20)).toBe(2))

const none = { altKey: false, ctrlKey: false, shiftKey: false }

test('wheel goes where the app wants it', () => {
  expect(wheelMode({ isAlternateBuffer: false, mouseTrackingMode: 'none' })).toBe('scroll')
  expect(wheelMode({ isAlternateBuffer: true, mouseTrackingMode: 'none' })).toBe('none')
  expect(wheelMode({ isAlternateBuffer: true, mouseTrackingMode: 'vt200' })).toBe('forward')
  expect(wheelMode(undefined)).toBe('scroll')
})

test('wheel encodes as SGR 1006', () => {
  expect(encodeWheel(-1, 3, 7, none)).toBe('\x1b[<64;3;7M')
  expect(encodeWheel(2, 1, 1, { ...none, ctrlKey: true })).toBe('\x1b[<81;1;1M\x1b[<81;1;1M')
})
