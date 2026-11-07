import { expect, test } from 'bun:test'

import { breakdown, contextTone, tokens } from './context-meter'

test('token counts read at a glance', () => {
  expect(tokens(812)).toBe('812')
  expect(tokens(84_200)).toBe('84k')
  expect(tokens(200_000)).toBe('200k')
  expect(tokens(1_000_000)).toBe('1M')
  expect(tokens(1_250_000)).toBe('1.3M')
})

test('the meter warns past 80% and alarms past 95%', () => {
  expect(contextTone(0.42)).toBe('calm')
  expect(contextTone(0.8)).toBe('warn')
  expect(contextTone(0.96)).toBe('critical')
})

test("the breakdown lists what's loaded by size, then what's deferred, the buffer, the free space", () => {
  const rows = breakdown({
    categories: [
      { deferred: false, name: 'System prompt', tokens: 6000 },
      { deferred: false, name: 'Messages', tokens: 13_900 },
      { deferred: true, name: 'MCP tools (deferred)', tokens: 16_100 },
      { deferred: false, name: 'Free space', tokens: 934_600 },
      { deferred: false, name: 'Autocompact buffer', tokens: 33_000 },
      { deferred: false, name: 'Skills', tokens: 0 },
    ],
    max: 1_000_000,
    mcpTools: [],
    total: 58_100,
  })
  expect(rows.map((r) => [r.name, r.kind, r.share])).toEqual([
    ['Messages', 'loaded', 0.0139],
    ['System prompt', 'loaded', 0.006],
    ['MCP tools (deferred)', 'deferred', 0.0161],
    ['Autocompact buffer', 'buffer', 0.033],
    ['Free space', 'free', 0.9346],
  ])
})
