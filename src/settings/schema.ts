// The app's settings, kept in settings.json next to its catalog. Only what the app reads.

import { DEFAULT_LOADERS, LOADER_NAMES, LOADER_SETTINGS, STATUS_LOADERS } from '../app/loaders'
import {
  DEFAULT_WALLPAPER,
  WALLPAPER_BLUR_SETTING,
  WALLPAPER_SETTING,
  WALLPAPERS,
} from '../app/wallpapers'

export type SettingValue = boolean | number | string

interface Base {
  id: string
  label: string
  /** One short line under the label, only where the label can't say it alone. */
  help?: string
}

export type Row =
  | (Base & { kind: 'toggle'; fallback: boolean })
  | (Base & {
      kind: 'number'
      fallback: number
      min: number
      max: number
      step: number
      /** A slider for a feel (blur, volume), a stepper for an exact value (a font size). */
      control: 'slider' | 'stepper'
      /** How the value reads beside a slider: "35%", "12 px"; 0 reads "Off" with `zeroOff`. */
      unit?: string
      zeroOff?: boolean
    })
  | (Base & { kind: 'text'; fallback: string; placeholder?: string; mono?: boolean })
  | (Base & {
      kind: 'select'
      fallback: string
      options: string[]
      /**
       * `segmented` for a few short values on one scale, `menu` for a list, `loader` and
       * `dots` for a loader picked from its animation, `tiles` for the backgrounds.
       */
      control: 'segmented' | 'menu' | 'loader' | 'dots' | 'tiles'
    })

export interface Group {
  label: string
  rows: Row[]
}

export interface Section {
  id: string
  label: string
  groups: Group[]
}

export const SECTIONS: Section[] = [
  {
    groups: [
      {
        label: 'Background',
        rows: [
          {
            control: 'tiles',
            fallback: DEFAULT_WALLPAPER,
            id: WALLPAPER_SETTING,
            kind: 'select',
            label: 'Background',
            options: [...WALLPAPERS],
          },
          {
            control: 'slider',
            fallback: 0,
            id: WALLPAPER_BLUR_SETTING,
            kind: 'number',
            label: 'Blur',
            max: 40,
            min: 0,
            step: 2,
            unit: ' px',
            zeroOff: true,
          },
        ],
      },
      {
        label: 'Loaders',
        rows: [
          {
            control: 'dots',
            fallback: DEFAULT_LOADERS.status,
            help: 'Sidebar, tabs and tool rows.',
            id: LOADER_SETTINGS.status,
            kind: 'select',
            label: 'Status',
            options: STATUS_LOADERS,
          },
          {
            control: 'loader',
            fallback: DEFAULT_LOADERS.working,
            help: 'While Claude works.',
            id: LOADER_SETTINGS.working,
            kind: 'select',
            label: 'Working',
            options: LOADER_NAMES,
          },
          {
            control: 'loader',
            fallback: DEFAULT_LOADERS.thinking,
            help: 'While Claude thinks.',
            id: LOADER_SETTINGS.thinking,
            kind: 'select',
            label: 'Thinking',
            options: LOADER_NAMES,
          },
        ],
      },
      {
        label: 'Effects',
        rows: [
          {
            control: 'menu',
            fallback: 'Dust',
            help: 'When a merged workspace leaves.',
            id: 'ui.cleanupEffect',
            kind: 'select',
            label: 'Clean up',
            options: ['Dust', 'Brush', 'Glint', 'None'],
          },
        ],
      },
    ],
    id: 'appearance',
    label: 'Appearance',
  },
  {
    groups: [
      {
        label: 'Context',
        rows: [
          {
            control: 'segmented',
            fallback: '250k',
            help: 'Smaller is cheaper and keeps Claude sharp. New chats.',
            id: 'chat.compactWindow',
            kind: 'select',
            label: 'Compact past',
            options: ['200k', '250k', '400k', '1M'],
          },
        ],
      },
    ],
    id: 'chats',
    label: 'Chats',
  },
  {
    groups: [
      {
        label: 'New workspaces',
        rows: [
          {
            fallback: true,
            help: 'Off forks from your local copy.',
            id: 'git.fetchBase',
            kind: 'toggle',
            label: 'Fetch the base branch first',
          },
          {
            fallback: '.env',
            help: 'Comma-separated globs from the main checkout.',
            id: 'git.worktreeCopyFiles',
            kind: 'text',
            label: 'Copy into new workspaces',
            mono: true,
          },
        ],
      },
    ],
    id: 'workspaces',
    label: 'Workspaces',
  },
  {
    groups: [
      {
        label: 'Text',
        rows: [
          {
            fallback: '',
            help: 'Any font on this Mac. A Nerd Font shows icons.',
            id: 'terminal.fontFamily',
            kind: 'text',
            label: 'Font',
            placeholder: 'Geist Mono',
          },
          {
            control: 'stepper',
            fallback: 12.5,
            id: 'terminal.fontSize',
            kind: 'number',
            label: 'Size',
            max: 24,
            min: 9,
            step: 0.5,
          },
        ],
      },
    ],
    id: 'terminal',
    label: 'Terminal',
  },
  {
    groups: [
      {
        label: 'Sound',
        rows: [
          {
            control: 'menu',
            fallback: 'Plane',
            help: "When a chat finishes or needs you, unless you're watching it.",
            id: 'notifications.sound',
            kind: 'select',
            label: 'Sound',
            options: ['Plane', 'Bell', 'Ding', 'Off'],
          },
          {
            control: 'slider',
            fallback: 35,
            id: 'notifications.volume',
            kind: 'number',
            label: 'Volume',
            max: 100,
            min: 0,
            step: 5,
            unit: '%',
          },
        ],
      },
    ],
    id: 'notifications',
    label: 'Notifications',
  },
]

/** Every row, in page order. */
export const ROWS: Row[] = SECTIONS.flatMap((s) => s.groups.flatMap((g) => g.rows))

/** The row behind a setting id; a typo is a bug, so it throws. */
export function rowById(id: string): Row {
  const row = ROWS.find((r) => r.id === id)
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

/** The rows of a section whose value differs from the default: what Restore defaults resets. */
export function changedRows(section: Section, stored: Record<string, SettingValue>): Row[] {
  return section.groups
    .flatMap((g) => g.rows)
    .filter((row) => effectiveValue(row, stored[row.id]) !== row.fallback)
}
