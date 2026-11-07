// The terminals' font, from Settings › Terminal: read once, then kept in step as it changes,
// so open terminals follow at once.
import { invoke } from '@tauri-apps/api/core'

export const DEFAULT_FONT = '"Geist Mono", ui-monospace, Menlo, monospace'
export const DEFAULT_SIZE = 12.5

export interface TerminalFont {
  family: string
  size: number
}

/** The font from stored settings: a named family goes first, the default behind it. */
export function fontFrom(settings: Record<string, unknown>): TerminalFont {
  const name = settings['terminal.fontFamily']
  const size = settings['terminal.fontSize']
  const named = typeof name === 'string' ? name.trim().replaceAll('"', '') : ''
  return {
    family: named === '' ? DEFAULT_FONT : `"${named}", ${DEFAULT_FONT}`,
    size: typeof size === 'number' && size >= 6 && size <= 40 ? size : DEFAULT_SIZE,
  }
}

let stored: Record<string, unknown> = {}
let current: TerminalFont = fontFrom(stored)
const listeners = new Set<(font: TerminalFont) => void>()

void invoke<{ settings: Record<string, unknown> }>('read_settings')
  .then((read) => {
    stored = read.settings
    current = fontFrom(stored)
    for (const l of listeners) l(current)
  })
  .catch(() => {
    // Unreadable settings: the default font.
  })

export const terminalFont = () => current

/** Follows the font as it changes; returns the unsubscribe. */
export function onTerminalFont(listener: (font: TerminalFont) => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** A terminal setting written (or reset, `null`) in Settings. */
export function noteTerminalSetting(id: string, value: unknown) {
  if (!id.startsWith('terminal.')) return
  stored = { ...stored, [id]: value ?? undefined }
  current = fontFrom(stored)
  for (const l of listeners) l(current)
}
