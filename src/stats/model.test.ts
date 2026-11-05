import { expect, test } from 'bun:test'

import {
  coveredWeeks,
  dayCost,
  formatSpan,
  formatUsd,
  heatmapWeeks,
  levels,
  sessionLengths,
  streaks,
} from './model'

const today = new Date(2026, 10, 5) // Thursday 5 Nov 2026

test('streaks: current run, best run, longest gap', () => {
  const days = Object.fromEntries(
    ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-30', '2026-11-04', '2026-11-05'].map(
      (k) => [k, { prompts: 2 }]
    )
  )
  expect(streaks(days, today)).toEqual({ activeDays: 6, best: 3, current: 2, longestGap: 7 })
  expect(streaks({ '2026-11-01': { prompts: 1 } }, today).current).toBe(0)
})

test('quartile levels', () => {
  expect(levels([0, 1, 2, 3, 4, 5, 6, 7, 8])).toEqual([0, 1, 1, 1, 2, 2, 3, 3, 4])
})

test('heatmap ends on the Saturday of this week, blank after today', () => {
  const weeks = heatmapWeeks({}, today, 2)
  expect(weeks[1]?.[0]).toBe('2026-11-01')
  expect(weeks[1]?.[4]).toBe('2026-11-05')
  expect(weeks[1]?.[5]).toBeNull()
  expect(weeks[0]?.[0]).toBe('2026-10-25')
  expect(coveredWeeks({}, today)).toBe(4)
})

test('cost follows each model share and counts what has no price', () => {
  const day = {
    models: { 'claude-opus-4-6-20251001': 600, 'mystery-model': 300 },
    tokens: { cacheRead: 0, cacheWrite: 0, input: 1_000_000, output: 0, total: 1000 },
  }
  const cost = dayCost(day)
  expect(cost.usd).toBeCloseTo(3)
  expect(cost.unpriced).toBe(400)
  expect(formatUsd(1234.4)).toBe('$1 234')
  expect(formatUsd(12.6)).toBe('$13')
  expect(formatUsd(1.234)).toBe('$1.23')
})

test('spans and session buckets', () => {
  expect(formatSpan(3 * 86_400_000)).toBe('3d 0h')
  expect(formatSpan(9 * 3600_000 + 4 * 60_000)).toBe('9h 04')
  expect(formatSpan(22 * 60_000)).toBe('22 min')
  const lengths = sessionLengths([
    {
      sessions: {
        a: { first: 0, last: 60_000, prompts: 1 },
        b: { first: 0, last: 3 * 3600_000, prompts: 9 },
      },
    },
  ])
  expect(lengths.buckets[0]?.count).toBe(1)
  expect(lengths.buckets[5]?.count).toBe(1)
  expect(lengths.longest).toBe(3 * 3600_000)
})
