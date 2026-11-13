// Which Settings pane shows: the window's nav picks it, ⌃Tab steps it.
// Remembered for the session.

import {
  BellIcon,
  GitBranchIcon,
  InfoIcon,
  type LucideIcon,
  MessageSquareIcon,
  PaletteIcon,
  ServerCogIcon,
  SquareTerminalIcon,
} from 'lucide-react'
import { useSyncExternalStore } from 'react'

import { SECTIONS } from '../settings/schema'

export interface Pane {
  id: string
  label: string
  icon: LucideIcon
}

const ICONS: Record<string, LucideIcon> = {
  appearance: PaletteIcon,
  chats: MessageSquareIcon,
  notifications: BellIcon,
  terminal: SquareTerminalIcon,
  workspaces: GitBranchIcon,
}

export const PANES: Pane[] = [
  ...SECTIONS.map((s) => ({ icon: ICONS[s.id] ?? InfoIcon, id: s.id, label: s.label })),
  { icon: ServerCogIcon, id: 'host', label: 'Background process' },
  { icon: InfoIcon, id: 'about', label: 'About' },
]

const FIRST: Pane = { icon: PaletteIcon, id: 'appearance', label: 'Appearance' }
let current = FIRST.id
const listeners = new Set<() => void>()

export const currentPane = () => current

export function setPane(id: string) {
  if (id === current || !PANES.some((p) => p.id === id)) return
  current = id
  for (const listener of listeners) listener()
}

/** Moves `by` panes, wrapping: ⌃Tab and the nav's arrows. */
export function stepPane(by: number) {
  const i = PANES.findIndex((p) => p.id === current)
  setPane(PANES[(i + by + PANES.length) % PANES.length]?.id ?? current)
}

export function usePane(): Pane {
  const id = useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => current
  )
  return PANES.find((p) => p.id === id) ?? FIRST
}
