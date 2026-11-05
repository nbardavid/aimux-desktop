import { expect, test } from 'bun:test'

import { chatFlags, cycleEffort, describe as label, normalize, parseModels } from './agents'

const models = parseModels(
  JSON.stringify([
    {
      description: 'x',
      displayName: 'Default (recommended)',
      supportedEffortLevels: ['low', 'high'],
      value: 'default',
    },
    { displayName: 'Opus 5.5', supportedEffortLevels: ['low', 'high'], value: 'opus' },
    { displayName: 'Haiku 4.5', value: 'claude-haiku-4-5' },
    { value: 42 },
  ])
)

test('parseModels reads Claude Code’s list and drops what is malformed', () => {
  expect(models.map((m) => m.name)).toEqual(['Default', 'Opus 5.5', 'Haiku 4.5'])
  expect(models[2]?.efforts).toEqual([])
})

test('normalize keeps only what the model takes', () => {
  expect(normalize({ effort: 'high', model: 'claude-haiku-4-5' }, models)).toEqual({
    effort: '',
    model: 'claude-haiku-4-5',
  })
  expect(normalize({ effort: 'high', model: 'gone' }, models).model).toBe('default')
})

test('effort cycles through the model’s levels and back to its default', () => {
  const at = (effort: string) => cycleEffort({ effort, model: 'opus' }, models).effort
  expect([at(''), at('low'), at('high')]).toEqual(['low', 'high', ''])
})

test('describe and flags leave defaults unsaid', () => {
  expect(label({ effort: 'high', model: 'opus' }, models)).toBe('Opus 5.5 · High')
  expect(chatFlags({ effort: '', model: 'default' })).toEqual({ effort: '', model: '' })
})
