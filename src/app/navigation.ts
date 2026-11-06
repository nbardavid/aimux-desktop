// Moving around by keyboard: what ⌘P lists, which tab takes over from a closed one, and the
// next or previous one of a list (⌃Tab, ⌥⌘↓).

import type { Project, Signal, Workspace } from '../model/catalog'
import type { PickerItem } from './picker'

interface PaletteChat {
  id: string
  title: string
  workspaceId: string
  /** When its last turn moved (ms). */
  activeAt?: number
}

interface Recency {
  /** Places visited (`ws:…`, `chat:…` keys), the latest first. */
  recent?: readonly string[]
  /** The place on screen: never in Recent (nor is the current workspace). */
  here?: string | null
  /** Each workspace's last activity (ms), by id. */
  activeAt?: Record<string, number>
}

/** How many places Recent lists. */
const RECENT = 5

/**
 * ⌘P: Recent (the last places visited, not the one on screen), then workspaces and chats, the
 * latest active first (sidebar order on a tie), then projects. Keys say what each one is.
 */
export function paletteItems(
  projects: Project[],
  workspaces: Record<string, Workspace[]>,
  chats: PaletteChat[],
  signals: Record<string, Signal | null>,
  currentWorkspaceId: string | null,
  { activeAt = {}, here = null, recent = [] }: Recency = {}
): PickerItem[] {
  const ordered = projects
    .flatMap((p) => (workspaces[p.id] ?? []).map((w) => ({ p, w })))
    .toSorted((a, b) => (activeAt[b.w.id] ?? 0) - (activeAt[a.w.id] ?? 0))
  const where = new Map(ordered.map(({ p, w }) => [w.id, `${p.name} · ${w.name}`]))
  const places: PickerItem[] = [
    ...ordered.map(({ p, w }) => ({
      icon: 'workspace' as const,
      key: `ws:${w.id}`,
      label: `${w.name} · ${p.name}`,
      meta: w.id === currentWorkspaceId ? 'current' : undefined,
      section: 'Workspaces',
      signal: signals[w.id] ?? null,
    })),
    ...chats
      .toSorted((a, b) => (b.activeAt ?? 0) - (a.activeAt ?? 0))
      .flatMap((c) => {
        const sub = where.get(c.workspaceId)
        return sub === undefined
          ? []
          : [
              {
                icon: 'chat' as const,
                key: `chat:${c.id}`,
                label: c.title,
                section: 'Chats',
                sub,
              },
            ]
      }),
  ]
  const valid = recent
    // Not where you are: neither the place on screen nor its workspace.
    .filter((k, i) => k !== here && k !== `ws:${currentWorkspaceId}` && recent.indexOf(k) === i)
    .filter((k) => places.some((item) => item.key === k))
  // A workspace one of its chats already stands for: the chat is the more specific place.
  const covered = new Set(
    chats.filter((c) => valid.includes(`chat:${c.id}`)).map((c) => `ws:${c.workspaceId}`)
  )
  const keys = valid.filter((k) => !covered.has(k)).slice(0, RECENT)
  return [
    ...keys.flatMap((k) => {
      const item = places.find((x) => x.key === k)
      return item ? [{ ...item, section: 'Recent' }] : []
    }),
    ...places.filter((item) => !keys.includes(item.key)),
    ...projects.map((p) => ({
      icon: 'project' as const,
      key: `project:${p.id}`,
      label: p.name,
      meta: `${workspaces[p.id]?.length ?? 0} ${workspaces[p.id]?.length === 1 ? 'workspace' : 'workspaces'}`,
      section: 'Projects',
      sub: p.path,
    })),
  ]
}

/** What a ⌘P key points at. */
export function paletteTarget(key: string): {
  kind: 'ws' | 'chat' | 'project'
  id: string
} {
  const at = key.indexOf(':')
  return {
    id: key.slice(at + 1),
    kind: key.slice(0, at) as 'ws' | 'chat' | 'project',
  }
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

/**
 * ⌘ keys the window's listeners own (app.tsx; ⌘L, chat-view.tsx), by `code`: Option changes
 * `key`.
 */
const APP_KEYS = new Set(['KeyB', 'KeyG', 'KeyL', 'KeyN', 'KeyO', 'KeyP', 'KeyT', 'KeyW', 'Comma'])

/**
 * A shortcut of the app's rather than of the shell: a focused terminal lets it through to the
 * window. ⌘C, ⌘V, ⌘K and the rest stay the terminal's.
 */
export function appShortcut(
  e: Pick<KeyboardEvent, 'altKey' | 'code' | 'ctrlKey' | 'key' | 'metaKey'>
): boolean {
  if (e.ctrlKey && !e.metaKey && (e.key === 'Tab' || /^Digit[1-9]$/.test(e.code))) return true
  if (!e.metaKey) return false
  if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) return true
  return APP_KEYS.has(e.code) || /^Digit[1-9]$/.test(e.code)
}
