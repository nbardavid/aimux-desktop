// Moving around by keyboard: what ⌘P lists, which tab takes over from a closed one, and the
// next or previous one of a list (⌃Tab, ⌥⌘↓).

import type { Project, Signal, Workspace } from '../model/catalog'
import type { PickerItem } from './picker'

interface PaletteChat {
  id: string
  title: string
  workspaceId: string
}

/** ⌘P: workspaces in sidebar order, then chats, then projects. Keys say what each one is. */
export function paletteItems(
  projects: Project[],
  workspaces: Record<string, Workspace[]>,
  chats: PaletteChat[],
  signals: Record<string, Signal | null>,
  currentWorkspaceId: string | null
): PickerItem[] {
  const ordered = projects.flatMap((p) => (workspaces[p.id] ?? []).map((w) => ({ p, w })))
  const where = new Map(ordered.map(({ p, w }) => [w.id, `${p.name} · ${w.name}`]))
  return [
    ...ordered.map(({ p, w }) => ({
      key: `ws:${w.id}`,
      label: `${w.name} · ${p.name}`,
      meta: w.id === currentWorkspaceId ? 'current' : undefined,
      signal: signals[w.id] ?? null,
    })),
    ...chats.flatMap((c) => {
      const sub = where.get(c.workspaceId)
      return sub === undefined ? [] : [{ key: `chat:${c.id}`, label: c.title, sub }]
    }),
    ...projects.map((p) => ({
      key: `project:${p.id}`,
      label: p.name,
      meta: `${workspaces[p.id]?.length ?? 0} ${workspaces[p.id]?.length === 1 ? 'workspace' : 'workspaces'}`,
      mono: true,
      sub: p.path,
    })),
  ]
}

/** What a ⌘P key points at. */
export function paletteTarget(key: string): { kind: 'ws' | 'chat' | 'project'; id: string } {
  const at = key.indexOf(':')
  return { id: key.slice(at + 1), kind: key.slice(0, at) as 'ws' | 'chat' | 'project' }
}

/**
 * The tab to show once `closing` goes: the one to its right, or to its left when it was the
 * last, as browsers do. Closing a tab that is not on screen changes nothing.
 */
export function afterClose(ids: string[], closing: string, active: string | undefined) {
  if (closing !== active) return active
  const at = ids.indexOf(closing)
  return ids[at + 1] ?? ids[at - 1]
}

/** The next (`step` 1) or previous (-1) of `ids` after `current`, wrapping around. */
export function stepThrough(ids: string[], current: string | undefined, step: 1 | -1) {
  if (ids.length === 0) return
  const at = current === undefined ? -1 : ids.indexOf(current)
  if (at === -1) return step === 1 ? ids[0] : ids.at(-1)
  return ids[(at + step + ids.length) % ids.length]
}
