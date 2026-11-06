import { expect, test } from 'bun:test'

import { rulerLayout, tickLabel } from './minimap'

test('ticks keep an 8px pitch, shrink to fit, then sample', () => {
  expect(rulerLayout(10, 400)).toEqual({ pitch: 8, step: 1 })
  expect(rulerLayout(100, 400)).toEqual({ pitch: 4, step: 1 })
  const many = rulerLayout(1000, 400)
  expect(many.step).toBe(8)
  expect(many.pitch * Math.ceil(1000 / many.step)).toBeLessThanOrEqual(400)
  expect(many.pitch).toBeGreaterThanOrEqual(3)
})

test('a tick’s label is the prompt’s first line, cut at 60 characters', () => {
  expect(tickLabel('Fix the menus\nand the picker')).toBe('Fix the menus')
  const long = tickLabel('x'.repeat(80))
  expect(long).toHaveLength(60)
  expect(long.endsWith('…')).toBe(true)
})
