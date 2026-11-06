// The app's settings, kept in settings.json next to its catalog. Only what the app reads.

import { DEFAULT_LOADERS, LOADER_NAMES, LOADER_SETTINGS } from '../app/loaders'

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
      /** `loader`: each option plays, in a grid under the label. */
      preview?: 'loader'
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
