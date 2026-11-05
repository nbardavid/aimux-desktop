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

/** The menu's list: the app's commands, then Claude's built-ins, then skills and plugins. */
export function availableCommands(chat: SlashCommand[], appWide: SlashCommand[]): SlashCommand[] {
  const seen = new Set(APP_COMMANDS.map((c) => c.name))
  const claude = (chat.length > 0 ? chat : appWide).filter((c) => {
    if (seen.has(c.name) || HIDDEN.has(c.name) || c.name.startsWith('__')) return false
    seen.add(c.name)
    return true
  })
  return [...APP_COMMANDS, ...claude.toSorted((a, b) => Number(b.builtin) - Number(a.builtin))]
}

/** Name or alias prefix first, then a match inside one, then in the description. */
export function rankCommands(list: SlashCommand[], query: string): SlashCommand[] {
  const q = query.toLowerCase()
  if (q === '') return list
  const rank = (c: SlashCommand) => {
    const names = [c.name, ...c.aliases].map((n) => n.toLowerCase())
    if (names.some((n) => n.startsWith(q))) return 0
    if (names.some((n) => n.includes(q))) return 1
    return c.description.toLowerCase().includes(q) ? 2 : 3
  }
  return list
    .map((c) => ({ c, r: rank(c) }))
    .filter((x) => x.r < 3)
    .toSorted((a, b) => a.r - b.r)
    .map((x) => x.c)
}

/** `/name args` at the start of a line; a lone `/` or a path (`/usr/bin`) is not one. */
export function parseCommand(text: string): { name: string; args: string } | null {
  const m = /^\/([\w:.-]+)(?:\s+([\s\S]*))?$/.exec(text.trim())
  return m ? { args: (m[2] ?? '').trim(), name: m[1] ?? '' } : null
}
