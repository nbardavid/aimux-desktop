import { expect, test } from 'bun:test'

import { contextTone, tokens } from './context-meter'

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
