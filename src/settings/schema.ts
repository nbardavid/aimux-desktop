// The app's settings, kept in settings.json next to its catalog. Only what the app reads.

import { DEFAULT_LOADERS, LOADER_NAMES, LOADER_SETTINGS, STATUS_LOADERS } from '../app/loaders'

export type SettingValue = boolean | number | string

export type Row =
  | { kind: 'toggle'; id: string; label: string; help: string; fallback: boolean }
  | {
      kind: 'number'
      id: string
      label: string
      help: string
      fallback: number
      min: number
      max: number
      step: number
    }
  | {
      kind: 'text'
      id: string
      label: string
      help: string
      fallback: string
      placeholder?: string
    }
  | {
      kind: 'select'
      id: string
      label: string
      help: string
      fallback: string
      options: string[]
      /** Each option plays, in a grid under the label: as text (`loader`) or as dots (`dots`). */
      preview?: 'loader' | 'dots'
    }

export interface Section {
  id: string
  label: string
  rows: Row[]
}

export const SECTIONS: Section[] = [
  {
    id: 'ui',
    label: 'Appearance',
    rows: [
      {
        fallback: 'Dust',
        help: 'How a workspace leaves when you clean it up after its PR merged. Pick one to see it.',
        id: 'ui.cleanupEffect',
        kind: 'select',
        label: 'Clean up effect',
        options: ['Dust', 'Brush', 'Glint', 'None'],
      },
      {
        fallback: DEFAULT_LOADERS.status,
        help: 'What shows wherever something works: the sidebar, tabs, tool rows.',
        id: LOADER_SETTINGS.status,
        kind: 'select',
        label: 'Status loader',
        options: STATUS_LOADERS,
        preview: 'dots',
      },
      {
        fallback: DEFAULT_LOADERS.working,
        help: 'What plays under the chat while Claude works.',
        id: LOADER_SETTINGS.working,
        kind: 'select',
        label: 'Working loader',
        options: LOADER_NAMES,
        preview: 'loader',
      },
      {
        fallback: DEFAULT_LOADERS.thinking,
        help: 'What plays while Claude thinks.',
        id: LOADER_SETTINGS.thinking,
        kind: 'select',
        label: 'Thinking loader',
        options: LOADER_NAMES,
        preview: 'loader',
      },
    ],
  },
  {
    id: 'notifications',
    label: 'Notifications',
    rows: [
      {
        fallback: 'Plane',
        help: 'Plays when a chat finishes or asks you something, unless you are looking at it. Pick one to hear it.',
        id: 'notifications.sound',
        kind: 'select',
        label: 'Sound',
        options: ['Plane', 'Bell', 'Ding', 'Off'],
      },
      {
        fallback: 35,
        help: "Percent of the sound's own level.",
        id: 'notifications.volume',
        kind: 'number',
        label: 'Volume',
        max: 100,
        min: 0,
        step: 5,
      },
    ],
  },
  {
    id: 'chat',
    label: 'Chats',
    rows: [
      {
        fallback: '250k',
        help: 'Claude Code compacts a chat by itself past this size: smaller costs less per message and keeps Claude sharp; 1M never compacts early. New and restarted chats.',
        id: 'chat.compactWindow',
        kind: 'select',
        label: 'Compact past',
        options: ['200k', '250k', '400k', '1M'],
      },
    ],
  },
  {
    id: 'terminal',
    label: 'Terminal',
    rows: [
      {
        fallback: '',
        help: 'A font installed on this Mac, by its name (a Nerd Font for icons). Empty: Geist Mono.',
        id: 'terminal.fontFamily',
        kind: 'text',
        label: 'Font',
        placeholder: 'JetBrainsMono Nerd Font',
      },
      {
        fallback: 12.5,
        help: 'In points.',
        id: 'terminal.fontSize',
        kind: 'number',
        label: 'Font size',
        max: 24,
        min: 9,
        step: 0.5,
      },
    ],
  },
  {
    id: 'git',
    label: 'Workspaces',
    rows: [
      {
        fallback: true,
        help: 'Fetch the base branch before forking from it. Off forks from your local copy.',
        id: 'git.fetchBase',
        kind: 'toggle',
        label: 'Refresh the base branch',
      },
      {
        fallback: '.env',
        help: 'Files copied from the main checkout into a new workspace. Comma-separated globs.',
        id: 'git.worktreeCopyFiles',
        kind: 'text',
        label: 'Seed new workspaces with',
      },
    ],
  },
]

/** The row behind a setting id; a typo is a bug, so it throws. */
export function rowById(id: string): Row {
  const row = SECTIONS.flatMap((section) => section.rows).find((r) => r.id === id)
  if (row === undefined) throw new Error(`no setting ${id}`)
  return row
}

/** What the app applies: a stored value of the right type, clamped to its range. */
export function effectiveValue(row: Row, stored: SettingValue | undefined): SettingValue {
  switch (row.kind) {
    case 'toggle':
      return typeof stored === 'boolean' ? stored : row.fallback
    case 'number':
      return typeof stored === 'number'
        ? Math.min(row.max, Math.max(row.min, stored))
        : row.fallback
    case 'select':
      return typeof stored === 'string' && row.options.includes(stored) ? stored : row.fallback
    case 'text':
      return typeof stored === 'string' ? stored : row.fallback
  }
}
