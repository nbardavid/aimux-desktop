import { expect, test } from 'bun:test'

import { gridSize } from './grid'

test('gridSize floors', () => {
  expect(gridSize({ height: 410, width: 805 }, { height: 20, width: 10 })).toEqual({
    cols: 80,
    rows: 20,
  })
})

test('tiny pane clamps', () => {
  expect(gridSize({ height: 5, width: 5 }, { height: 20, width: 10 })).toEqual({ cols: 2, rows: 1 })
})
