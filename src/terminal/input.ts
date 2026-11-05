export interface KeyLike {
  key: string
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
}

// From `feat/gui-tauri:src/gui/key-encode.ts`, keyed by DOM `KeyboardEvent.key`.
const NAMED: Record<string, string> = {
  ArrowDown: '\x1b[B',
  ArrowLeft: '\x1b[D',
  ArrowRight: '\x1b[C',
  ArrowUp: '\x1b[A',
  Backspace: '\x7f',
  Delete: '\x1b[3~',
  End: '\x1b[F',
  Enter: '\r',
  Escape: '\x1b',
  Home: '\x1b[H',
  Insert: '\x1b[2~',
  PageDown: '\x1b[6~',
  PageUp: '\x1b[5~',
  Tab: '\t',
}

const SHIFTED: Record<string, string> = {
  Enter: '\x1b\r',
  Tab: '\x1b[Z',
}

/** Cmd (metaKey) is never sent: it belongs to the app's shortcuts. */
export function encodeKey(e: KeyLike): string | null {
  if (e.metaKey) return null
  const shifted = e.shiftKey ? SHIFTED[e.key] : undefined
  if (shifted !== undefined) return shifted
  const named = NAMED[e.key]
  if (named !== undefined) return e.altKey ? `\x1b${named}` : named

  // DOM names non-printing keys with a capitalized word: Shift, Dead, F5, Unidentified…
  if (e.key === '' || /^[A-Z][A-Za-z0-9]+$/.test(e.key)) return null
  if (e.ctrlKey) {
    const code = e.key.toUpperCase().charCodeAt(0)
    return code >= 64 && code <= 95 ? String.fromCharCode(code & 0x1f) : null
  }
  // macOS Option composes characters (`[`, `|`, `~` on many layouts): those arrive already
  // composed and are typed as-is. Only a bare letter or digit means Option-as-Meta.
  if (e.altKey && /^[a-z0-9]$/i.test(e.key)) return `\x1b${e.key}`
  return e.key
}

const PASTE_START = '\x1b[200~'
const PASTE_END = '\x1b[201~'

/** Newlines become CR, as a terminal sends them. Bracketed: the markers are stripped from the
 * text (until none is left, so nested fragments cannot reassemble one) before wrapping. */
export function encodePaste(text: string, bracketed: boolean): string {
  const body = text.replaceAll(/\r?\n/g, '\r')
  if (!bracketed) return body
  let clean = body
  let previous = ''
  while (clean !== previous) {
    previous = clean
    clean = clean.replaceAll(PASTE_START, '').replaceAll(PASTE_END, '')
  }
  return `${PASTE_START}${clean}${PASTE_END}`
}

const DOM_DELTA_LINE = 1

/** Lines for the `scroll` request: negative = up into the history, like the TUI's wheel. */
export function wheelLines(deltaY: number, deltaMode: number, cellHeight: number): number {
  const lines = deltaMode === DOM_DELTA_LINE ? deltaY : deltaY / cellHeight
  return Math.trunc(lines)
}
