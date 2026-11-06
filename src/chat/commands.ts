// The `/` commands of a chat: Claude Code's own (from its `initialize` answer) and the app's.

import type { SlashCommand } from './model'

const app = (name: string, argumentHint: string, description: string): SlashCommand => ({
  aliases: [],
  argumentHint,
  builtin: false,
  description,
  name,
})

/** What the app does itself, in place of Claude Code's TUI-only versions. */
export const APP_COMMANDS: SlashCommand[] = [
  app('resume', '[search]', 'Pick up an earlier session of this project'),
  app('clear', '', 'Start a fresh session in this tab'),
  app('model', '[name]', 'Switch this chat’s model'),
  app('effort', '[level]', 'Set how hard this chat’s model thinks'),
  app('rename', '[title]', 'Rename this chat'),
]

// Meaningless or removed in a headless window.
const HIDDEN = new Set([
  'color',
  'focus',
  'heapdump',
  'workflow-launch-exec',
  'extra-usage',
  'agents',
])

export const isAppCommand = (name: string) => APP_COMMANDS.some((c) => c.name === name)

/** `plugin:name` is shown as `name`, with its plugin beside it. */
export function commandParts(name: string): { plugin: string; short: string } {
  const at = name.indexOf(':')
  return at === -1
    ? { plugin: '', short: name }
    : { plugin: name.slice(0, at), short: name.slice(at + 1) }
}

/** The menu's list: the app's commands, then everything Claude Code offers, by the name shown. */
export function availableCommands(chat: SlashCommand[], appWide: SlashCommand[]): SlashCommand[] {
  const seen = new Set(APP_COMMANDS.map((c) => c.name))
  const claude = (chat.length > 0 ? chat : appWide).filter((c) => {
    if (seen.has(c.name) || HIDDEN.has(c.name) || c.name.startsWith('__')) return false
    seen.add(c.name)
    return true
  })
  const shown = (c: SlashCommand) => commandParts(c.name).short
  return [
    ...APP_COMMANDS,
    ...claude.toSorted((a, b) => shown(a).localeCompare(shown(b)) || a.name.localeCompare(b.name)),
  ]
}

/**
 * The `/` menu's two groups: aimux (what the app does itself) and Claude Code (the rest).
 * Claude Code flags its bundled skills `builtin` too: commands and skills can't be told apart.
 */
export const commandGroup = (c: SlashCommand): 'aimux' | 'Claude Code' =>
  isAppCommand(c.name) ? 'aimux' : 'Claude Code'

/** How long a description may run in the menu, "…" included. */
const DESCRIPTION_MAX = 80

/**
 * A description as the menu shows it: its first sentence, at most 80 characters, without the
 * "(plugin)" its plugin's chip already says.
 */
export function shortDescription(text: string, plugin = ''): string {
  let line = text.trim().split('\n')[0] ?? ''
  if (plugin !== '' && line.startsWith(`(${plugin})`))
    line = line.slice(plugin.length + 2).trimStart()
  const sentence = /^[\s\S]*?(?<!\b(?:e\.g|i\.e|etc|vs))[.!?](?=\s|$)/.exec(line)?.[0] ?? line
  return sentence.length <= DESCRIPTION_MAX
    ? sentence
    : `${sentence.slice(0, DESCRIPTION_MAX - 1).trimEnd()}…`
}

/** A query this short matches names only: in descriptions it would match almost anything. */
const DESCRIPTION_QUERY = 3

/**
 * Name or alias prefix first, then a match inside one, then a word of the description (for
 * three letters or more). Among prefix matches, the app's commands lead, then Claude's
 * built-ins, then the rest; a name before an alias, then shorter names first.
 */
export function rankCommands(list: SlashCommand[], query: string): SlashCommand[] {
  const q = query.toLowerCase()
  if (q === '') return list
  const rank = (c: SlashCommand) => {
    const names = [c.name, ...c.aliases].map((n) => n.toLowerCase())
    if (names.some((n) => n.startsWith(q))) return 0
    if (names.some((n) => n.includes(q))) return 1
    if (q.length < DESCRIPTION_QUERY) return 3
    const words = c.description.toLowerCase().split(/[^a-z0-9]+/)
    return words.some((w) => w.startsWith(q)) ? 2 : 3
  }
  // ponytail: Claude Code flags its bundled skills `builtin` too, so the name's length stands in
  // for "a short built-in command" (`/config` before `/code-review`); a real flag would beat it.
  // `/co` is `/config` before `/usage` (whose alias is `cost`).
  const byAlias = (c: SlashCommand) => (c.name.toLowerCase().startsWith(q) ? 0 : 1)
  const kind = (c: SlashCommand) => {
    if (isAppCommand(c.name)) return 0
    return c.builtin ? 1 : 2
  }
  return list
    .map((c) => ({ c, r: rank(c) }))
    .filter((x) => x.r < 3)
    .toSorted(
      (a, b) =>
        a.r - b.r ||
        (a.r === 0
          ? kind(a.c) - kind(b.c) ||
            byAlias(a.c) - byAlias(b.c) ||
            a.c.name.length - b.c.name.length
          : 0)
    )
    .map((x) => x.c)
}

/** The alias a query matched when the name itself does not hold it: shown beside the name. */
export function matchedAlias(command: SlashCommand, query: string): string | undefined {
  const q = query.toLowerCase()
  if (q === '' || command.name.toLowerCase().includes(q)) return undefined
  return command.aliases.find((a) => a.toLowerCase().includes(q))
}

/** `/name args` at the start of a line; a lone `/` or a path (`/usr/bin`) is not one. */
export function parseCommand(text: string): { name: string; args: string } | null {
  const m = /^\/([\w:.-]+)(?:\s+([\s\S]*))?$/.exec(text.trim())
  return m ? { args: (m[2] ?? '').trim(), name: m[1] ?? '' } : null
}
