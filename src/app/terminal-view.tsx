import { type CompositionEvent, useCallback, useEffect, useRef, type WheelEvent } from 'react'

import type { Viewport } from '../model/session'

import { xterm256Palette } from '../terminal/colors'
import { measureCell } from '../terminal/grid'
import { encodeKey, encodePaste, encodeWheel, wheelLines, wheelMode } from '../terminal/input'
import { CELL_HEIGHT, TERMINAL_FONT, TerminalPane } from '../terminal/terminal-pane'

// ponytail: one light palette; read the user's theme once the GUI has settings.
const PALETTE = xterm256Palette([
  '#0B0C0F',
  '#C43A2B',
  '#2F7D46',
  '#8A6A0C',
  '#2F5FBF',
  '#8250DF',
  '#1B7C83',
  '#6E7781',
  '#57606A',
  '#D6453A',
  '#3A9354',
  '#A07A10',
  '#3D72D8',
  '#9467E6',
  '#25919A',
  '#8C959F',
])
const RESIZE_DEBOUNCE_MS = 100

interface Props {
  tabId: string
  viewport: Viewport | undefined
  write: (tabId: string, data: string) => void
  scroll: (tabId: string, lines: number) => void
  scrollToBottom: (tabId: string) => void
  resize: (tabId: string, cols: number, rows: number) => void
}

export function TerminalView({ resize, scroll, scrollToBottom, tabId, viewport, write }: Props) {
  const input = useRef<HTMLTextAreaElement>(null)
  const wheelCarry = useRef(0)
  const size = useRef<{ cols: number; rows: number } | null>(null)
  const resizeTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  // The tab on screen takes the pane's size, as the TUI does when it focuses a tab.
  useEffect(() => {
    input.current?.focus()
    if (size.current) resize(tabId, size.current.cols, size.current.rows)
  }, [resize, tabId])

  const onResize = useCallback(
    (cols: number, rows: number) => {
      size.current = { cols, rows }
      clearTimeout(resizeTimer.current)
      resizeTimer.current = setTimeout(() => resize(tabId, cols, rows), RESIZE_DEBOUNCE_MS)
    },
    [resize, tabId]
  )

  const type = (data: string) => {
    const snapshot = viewport?.snapshot
    if (snapshot && snapshot.viewportY < snapshot.baseY) scrollToBottom(tabId)
    write(tabId, data)
  }
  const typeRef = useRef(type)
  typeRef.current = type
  const bracketed = useRef(false)
  bracketed.current = viewport?.modes.bracketedPasteMode ?? false

  // Keys and pastes go to the terminal wherever the focus sits (a tab or a sidebar row just
  // clicked), except in a field or a dialog of the app's own.
  useEffect(() => {
    const sink = input.current
    const ownedElsewhere = (target: EventTarget | null) =>
      target !== sink &&
      target instanceof Element &&
      target.closest('input, textarea, select, .dialog') !== null
    const refocus = () => {
      if (window.getSelection()?.isCollapsed !== false) sink?.focus()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || ownedElsewhere(e.target)) return
      const data = encodeKey(e)
      if (data === null) return
      e.preventDefault()
      typeRef.current(data)
      if (e.target !== sink) sink?.focus()
    }
    const onPaste = (e: ClipboardEvent) => {
      if (ownedElsewhere(e.target)) return
      e.preventDefault()
      const text = e.clipboardData?.getData('text/plain') ?? ''
      if (text !== '') typeRef.current(encodePaste(text, bracketed.current))
    }
    // Native selection stays usable: refocus only when nothing is selected.
    const onMouseUp = (e: MouseEvent) => {
      if (!ownedElsewhere(e.target)) refocus()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('paste', onPaste)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('focus', refocus)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('paste', onPaste)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('focus', refocus)
    }
  }, [])

  const onComposition = (e: CompositionEvent<HTMLTextAreaElement>) => {
    if (e.data) type(e.data)
    e.currentTarget.value = ''
  }

  const onWheel = (e: WheelEvent) => {
    const mode = wheelMode(viewport?.modes)
    if (mode === 'none') return
    // A wheel notch is 3 lines for an app, 1 for the history: trackpads send a few pixels per
    // event, so carry the remainder until it makes a step.
    const step = mode === 'forward' ? 3 * CELL_HEIGHT : CELL_HEIGHT
    wheelCarry.current += e.deltaMode === 1 ? e.deltaY * CELL_HEIGHT : e.deltaY
    const steps = wheelLines(wheelCarry.current, 0, step)
    if (steps === 0) return
    wheelCarry.current -= steps * step
    if (mode === 'scroll') {
      scroll(tabId, steps)
      return
    }
    const grid = e.currentTarget.querySelector('.terminal')?.getBoundingClientRect()
    if (!grid) return
    const cellWidth = measureCell(TERMINAL_FONT).width
    const col = Math.max(1, Math.floor((e.clientX - grid.left) / cellWidth) + 1)
    const row = Math.max(1, Math.floor((e.clientY - grid.top) / CELL_HEIGHT) + 1)
    write(tabId, encodeWheel(steps, col, row, e))
  }

  return (
    <section className="term" onWheel={onWheel}>
      <TerminalPane snapshot={viewport?.snapshot} palette={PALETTE} onResize={onResize} />
      <textarea
        ref={input}
        className="input-sink"
        aria-label="Terminal input"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        onCompositionEnd={onComposition}
      />
    </section>
  )
}
