import { expect, test } from 'bun:test'

import { claudeSnapshot, formatRemaining, headline, paceOf } from './quota'

const NOW = Date.parse('2026-11-05T12:00:00Z')
const inHours = (h: number) => new Date(NOW + h * 3600_000).toISOString()

test('remaining time reads like the TUI', () => {
  expect(formatRemaining(2 * 86_400 + 3 * 3600)).toBe('2d 3h')
  expect(formatRemaining(4 * 3600 + 12 * 60)).toBe('4h 12m')
  expect(formatRemaining(5 * 3600)).toBe('5h')
  expect(formatRemaining(40 * 60)).toBe('40m')
  expect(formatRemaining(-1)).toBeNull()
})

test('pace: half the week gone, 30% used is ahead and lasts', () => {
  const week = 7 * 86_400
  const pace = paceOf(30, week / 2, week)
  expect(pace?.stage).toBe('farAhead')
  expect(pace?.label).toBe('Ahead (-20%)')
  expect(pace?.rightText).toBe('Lasts to reset')
  expect(paceOf(80, week / 2, week)?.rightText).toBe('Runs out in 21h')
  expect(paceOf(49, week / 2, week)?.label).toBe('On pace')
})

test('pace: running out before the reset is never on pace', () => {
  const week = 7 * 86_400
  const pace = paceOf(51, week / 2, week)
  expect(pace?.label).toBe('Too fast')
  expect(pace?.stage).toBe('slightlyBehind')
  expect(pace?.rightText).toBe('Runs out in 3d 8h')
})

test('the chip shows the session unless a weekly window is about to block', () => {
  const raw = {
    five_hour: { resets_at: inHours(2), utilization: 42 },
    seven_day: { resets_at: inHours(51), utilization: 71 },
    seven_day_opus: { resets_at: inHours(51), utilization: 88 },
  }
  const snap = claudeSnapshot(raw, NOW)
  expect(headline({ claude: { fetchedAt: NOW, snapshot: snap } })?.label).toBe('Session')
  const blocked = claudeSnapshot(
    { ...raw, seven_day_opus: { resets_at: inHours(51), utilization: 93 } },
    NOW
  )
  expect(headline({ claude: { fetchedAt: NOW, snapshot: blocked } })?.label).toBe('Opus')
  expect(headline({})).toBeNull()
})

test('snapshot takes session first and adds scoped weekly limits', () => {
  const snap = claudeSnapshot(
    {
      five_hour: { resets_at: inHours(1), utilization: 34 },
      limits: [
        {
          kind: 'weekly_scoped',
          percent: 12,
          resets_at: inHours(48),
          scope: { model: { display_name: 'Fable' } },
        },
      ],
      seven_day: { resets_at: inHours(84), utilization: 120 },
      seven_day_opus: null,
    },
    NOW
  )
  expect(snap.percent).toBe(34)
  expect(snap.timeRemaining).toBe('1h')
  expect(snap.windows.map((w) => [w.kind, w.percent])).toEqual([
    ['session', 34],
    ['weekly', 100],
    ['fable', 12],
  ])
  expect(snap.windows[1]?.pace).not.toBeNull()
  expect(snap.windows[0]?.pace).toBeNull()
})
