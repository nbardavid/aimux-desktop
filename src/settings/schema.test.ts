import { expect, test } from 'bun:test'

import { changedRows, effectiveValue, type Row, ROWS, SECTIONS } from './schema'

const number: Row = {
  control: 'stepper',
  fallback: 5,
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
    control: 'menu',
    fallback: 'a',
    id: 's',
    kind: 'select',
    label: 's',
    options: ['a', 'b'],
  }
  expect(effectiveValue(select, 'z')).toBe('a')
  expect(effectiveValue(select, 'b')).toBe('b')
})

test('every row id is unique and every fallback is valid', () => {
  const rows = ROWS
  expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length)
  for (const row of rows) expect(effectiveValue(row, undefined)).toBe(row.fallback)
})

test('Restore defaults counts only values that differ from their default', () => {
  const section = SECTIONS.find((s) => s.id === 'notifications')
  if (section === undefined) throw new Error('no notifications')
  expect(changedRows(section, {})).toEqual([])
  expect(changedRows(section, { 'notifications.volume': 35 })).toEqual([])
  expect(changedRows(section, { 'notifications.volume': 50 }).map((r) => r.id)).toEqual([
    'notifications.volume',
  ])
})
