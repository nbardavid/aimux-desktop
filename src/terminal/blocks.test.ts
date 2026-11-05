import { expect, test } from 'bun:test'

import { blockRects } from './blocks'

test('full, halves and eighths', () => {
  expect(blockRects('█')).toEqual({ rects: [[0, 0, 1, 1]], shade: 1 })
  expect(blockRects('▀')).toEqual({ rects: [[0, 0, 1, 0.5]], shade: 1 })
  expect(blockRects('▄')).toEqual({ rects: [[0, 0.5, 1, 1]], shade: 1 })
  expect(blockRects('▌')).toEqual({ rects: [[0, 0, 0.5, 1]], shade: 1 })
  expect(blockRects('▐')).toEqual({ rects: [[0.5, 0, 1, 1]], shade: 1 })
  expect(blockRects('▁')).toEqual({ rects: [[0, 0.875, 1, 1]], shade: 1 })
})

test('quadrants, as in the Claude Code mascot', () => {
  expect(blockRects('▛')?.rects).toEqual([
    [0, 0, 0.5, 0.5],
    [0.5, 0, 1, 0.5],
    [0, 0.5, 0.5, 1],
  ])
  expect(blockRects('▗')?.rects).toEqual([[0.5, 0.5, 1, 1]])
})

test('shades and non-blocks', () => {
  expect(blockRects('▒')).toEqual({ rects: [[0, 0, 1, 1]], shade: 0.5 })
  expect(blockRects('a')).toBeNull()
  expect(blockRects('─')).toBeNull()
})
