import { expect, test } from 'bun:test'

import type { SlashCommand } from './model'

import {
  APP_COMMANDS,
  availableCommands,
  isAppCommand,
  parseCommand,
  rankCommands,
} from './commands'

const c = (name: string, o: Partial<SlashCommand> = {}): SlashCommand => ({
  aliases: [],
  argumentHint: '',
  builtin: true,
  description: '',
  name,
  ...o,
})

test('prefix beats substring beats description', () => {
  const list = [c('recompact'), c('other', { description: 'compact it' }), c('compact')]
  expect(rankCommands(list, 'comp').map((x) => x.name)).toEqual(['compact', 'recompact', 'other'])
})

test('ranking ignores case, keeps order within a rank, and an empty query keeps all', () => {
  const list = [c('b-init'), c('a-init'), c('Init')]
  expect(rankCommands(list, 'INIT').map((x) => x.name)).toEqual(['Init', 'b-init', 'a-init'])
  expect(rankCommands(list, '')).toEqual(list)
  expect(rankCommands(list, 'zzz')).toEqual([])
})

test('aliases match', () => {
  expect(rankCommands([c('usage', { aliases: ['cost'] })], 'cos')[0]?.name).toBe('usage')
})

test('app commands lead and replace Claude’s, hidden ones go', () => {
  const names = availableCommands([c('compact'), c('model'), c('color'), c('__x')], []).map(
    (x) => x.name
  )
  expect(names.slice(0, 5)).toEqual(['resume', 'clear', 'model', 'effort', 'rename'])
  expect(names).toContain('compact')
  expect(names.filter((n) => n === 'model')).toHaveLength(1)
  expect(names).not.toContain('color')
  expect(names).not.toContain('__x')
})

test('the app-wide list stands in until the chat answers', () => {
  expect(availableCommands([], [c('compact')]).map((x) => x.name)).toContain('compact')
  expect(availableCommands([c('init')], [c('compact')]).map((x) => x.name)).not.toContain('compact')
  expect(availableCommands([], [])).toEqual(APP_COMMANDS)
})

test('parsing', () => {
  expect(parseCommand('/compact keep tests')).toEqual({ args: 'keep tests', name: 'compact' })
  expect(parseCommand('/ponytail:ponytail-review')).toEqual({
    args: '',
    name: 'ponytail:ponytail-review',
  })
  expect(parseCommand('/')).toBeNull()
  expect(parseCommand('/usr/bin/env is weird')).toBeNull()
  expect(parseCommand('hello /compact')).toBeNull()
})

test('only the app’s own names are app commands', () => {
  expect(isAppCommand('resume')).toBe(true)
  expect(isAppCommand('compact')).toBe(false)
})
