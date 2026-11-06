import { expect, test } from 'bun:test'

import type { SlashCommand } from './model'

import {
  APP_COMMANDS,
  availableCommands,
  commandGroup,
  commandParts,
  isAppCommand,
  matchedAlias,
  parseCommand,
  rankCommands,
  shortDescription,
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

test('short queries match names only; longer ones match description words at their start', () => {
  const list = [c('dataviz', { description: 'Charts, a colour palette' }), c('compact')]
  expect(rankCommands(list, 'co').map((x) => x.name)).toEqual(['compact'])
  expect(rankCommands(list, 'col').map((x) => x.name)).toEqual(['dataviz'])
  // Inside a word does not count.
  expect(rankCommands([c('x', { description: 'recolour' })], 'col')).toEqual([])
})

test('among prefix matches: the app’s commands, then built-ins, then skills; short first', () => {
  const list = [
    c('code-review'),
    c('commit-helper', { builtin: false }),
    c('context'),
    c('config'),
    c('clear'),
  ]
  expect(rankCommands(list, 'c').map((x) => x.name)).toEqual([
    'clear',
    'config',
    'context',
    'code-review',
    'commit-helper',
  ])
})

test('a name match comes before an alias match', () => {
  const list = [c('usage', { aliases: ['cost'] }), c('config')]
  expect(rankCommands(list, 'co').map((x) => x.name)).toEqual(['config', 'usage'])
})

test('an alias the query matched shows only when the name does not hold it', () => {
  const usage = c('usage', { aliases: ['cost'] })
  expect(matchedAlias(usage, 'co')).toBe('cost')
  expect(matchedAlias(usage, 'us')).toBeUndefined()
  expect(matchedAlias(usage, '')).toBeUndefined()
  expect(matchedAlias(c('config'), 'co')).toBeUndefined()
})

test('the / menu groups: the app’s five as aimux, then all of Claude Code’s by name', () => {
  const list = availableCommands(
    [
      c('ponytail', { builtin: false }),
      c('compact'),
      c('superpowers:writing-plans', { builtin: false }),
      c('superpowers:brainstorming', { builtin: false }),
    ],
    []
  )
  // By the name as shown: `superpowers:brainstorming` is `/brainstorming`.
  expect(list.map((x) => `${commandGroup(x)}:${x.name}`)).toEqual([
    ...APP_COMMANDS.map((x) => `aimux:${x.name}`),
    'Claude Code:superpowers:brainstorming',
    'Claude Code:compact',
    'Claude Code:ponytail',
    'Claude Code:superpowers:writing-plans',
  ])
})

test('a plugin’s name shows without its prefix, its plugin beside it', () => {
  expect(commandParts('superpowers:brainstorming')).toEqual({
    plugin: 'superpowers',
    short: 'brainstorming',
  })
  expect(commandParts('compact')).toEqual({ plugin: '', short: 'compact' })
})

test('a description drops the "(plugin)" its chip already says', () => {
  expect(shortDescription('(superpowers) You MUST use this. Really.', 'superpowers')).toBe(
    'You MUST use this.'
  )
  expect(shortDescription('(superpowers) Kept without a chip.')).toBe(
    '(superpowers) Kept without a chip.'
  )
  expect(shortDescription('(other) Kept for another plugin.', 'superpowers')).toBe(
    '(other) Kept for another plugin.'
  )
})

test('a description shows its first sentence, 80 characters at most', () => {
  expect(shortDescription('Clear the chat. Then start over.')).toBe('Clear the chat.')
  expect(shortDescription('Push a design system, e.g. Acme DS. More here.')).toBe(
    'Push a design system, e.g. Acme DS.'
  )
  expect(shortDescription('One line\nand another')).toBe('One line')
  const long = `Use this skill whenever you are about to create ANY chart, graph, plot, dashboard, or data visualization`
  const cut = shortDescription(long)
  expect(cut).toHaveLength(80)
  expect(cut.endsWith('…')).toBe(true)
  expect(shortDescription('Version 1.5 is out')).toBe('Version 1.5 is out')
})
