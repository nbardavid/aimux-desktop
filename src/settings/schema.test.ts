import { expect, test } from 'bun:test'

import { effectiveValue, type Row, rowById, SECTIONS } from './schema'

const number: Row = {
  fallback: 5,
  help: '',
  id: 'n',
  kind: 'number',
  label: 'n',
  max: 10,
  min: 1,
  step: 1,
}

test('stored values are clamped and type-checked like the TUI does', () => {
  expect(effectiveValue(number, 50)).toBe(10)
  expect(effectiveValue(number, '3')).toBe(5)
  expect(effectiveValue(number, undefined)).toBe(5)
  const select: Row = {
    fallback: 'a',
    help: '',
    id: 's',
    kind: 'select',
    label: 's',
    options: ['a', 'b'],
  }
  expect(effectiveValue(select, 'z')).toBe('a')
  expect(effectiveValue(select, 'b')).toBe('b')
})

test('every row id is unique and every fallback is valid', () => {
  const rows = SECTIONS.flatMap((s) => s.rows)
  expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length)
  for (const row of rows) expect(effectiveValue(row, undefined)).toBe(row.fallback)
})

test('artifacts are a toggle, on unless turned off', () => {
  const row = rowById('chat.artifacts')
  expect(row.kind).toBe('toggle')
  expect(row.fallback).toBe(true)
})
