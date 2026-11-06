import { expect, test } from 'bun:test'

import {
  agentCommand,
  agentLabel,
  chatFlags,
  cycleEffort,
  normalize,
  parseModels,
  reportedModel,
} from './agents'

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

test('parseModels takes the whole initialize answer too', () => {
  const answer = JSON.stringify({ commands: [], models: [{ displayName: 'Opus', value: 'opus' }] })
  expect(parseModels(answer).map((m) => m.value)).toEqual(['opus'])
  expect(parseModels('null')).toEqual([])
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

test('the label and the flags leave defaults unsaid', () => {
  expect(agentLabel({ effort: 'high', model: 'opus' }, models)).toBe('Opus 5.5 · High')
  expect(chatFlags({ effort: '', model: 'default' })).toEqual({ effort: '', model: '' })
})

const live = parseModels(
  JSON.stringify([
    {
      displayName: 'Default (recommended)',
      resolvedModel: 'claude-opus-5-5',
      supportedEffortLevels: ['low', 'high'],
      value: 'default',
    },
    {
      displayName: 'Opus 5.5',
      resolvedModel: 'claude-opus-5-5',
      supportedEffortLevels: ['low', 'high'],
      value: 'opus',
    },
    { displayName: 'Haiku 4.5', value: 'claude-haiku-4-5' },
  ])
)

test('a chat’s footer names its model, the default’s real one, and its effort', () => {
  expect(agentLabel({ effort: '', model: 'default' }, live)).toBe('Opus 5.5 · Auto')
  expect(agentLabel({ effort: 'high', model: 'opus' }, live)).toBe('Opus 5.5 · High')
  expect(agentLabel({ effort: '', model: 'claude-haiku-4-5' }, live)).toBe('Haiku 4.5')
})

test('/model and /effort with a name apply it; anything else opens the picker', () => {
  const now = { effort: 'high', model: 'opus' }
  expect(agentCommand('model', 'Haiku 4.5', now, live)).toEqual({
    effort: '',
    model: 'claude-haiku-4-5',
  })
  expect(agentCommand('model', 'DEFAULT', now, live)).toEqual({ effort: 'high', model: 'default' })
  expect(agentCommand('model', 'gpt', now, live)).toBeNull()
  expect(agentCommand('model', '', now, live)).toBeNull()
  expect(agentCommand('effort', 'Low', now, live)).toEqual({ effort: 'low', model: 'opus' })
  expect(agentCommand('effort', 'auto', now, live)).toEqual({ effort: '', model: 'opus' })
  expect(agentCommand('effort', 'max', now, live)).toBeNull()
})

test('the model Claude Code reports becomes the record’s, unless it is the same one', () => {
  // `default` runs Opus 5.5: the record keeps saying default.
  expect(reportedModel('claude-opus-5-5', '', live)).toBe('')
  expect(reportedModel('claude-opus-5-5', 'opus', live)).toBe('opus')
  expect(reportedModel('Haiku 4.5', 'opus', live)).toBe('claude-haiku-4-5')
  expect(reportedModel('Opus 5.5', 'claude-haiku-4-5', live)).toBe('opus')
  expect(reportedModel('Default', 'opus', live)).toBe('')
  expect(reportedModel('gpt-9', 'opus', live)).toBe('opus')
})
