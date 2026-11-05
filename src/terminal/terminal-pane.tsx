import type { TerminalSnapshot, TerminalSpan } from '@brimveyn/aimux-config'

import { type CSSProperties, useEffect, useMemo, useRef } from 'react'

import { spanColor } from './colors'
import { gridSize, measureCell } from './grid'

export const TERMINAL_FONT = '13px/18px "SF Mono", Menlo, monospace'

interface Props {
  snapshot: TerminalSnapshot | undefined
  palette: readonly string[]
  onResize: (cols: number, rows: number) => void
}

function spanStyle(span: TerminalSpan, palette: readonly string[], cursor: boolean): CSSProperties {
  let color = spanColor(span, 'fg', palette)
  let backgroundColor = spanColor(span, 'bg', palette)
  if (cursor) {
    // Block cursor = the cell in inverse video.
    ;[color, backgroundColor] = [backgroundColor ?? 'var(--term-bg)', color ?? 'var(--term-fg)']
  }
  return {
    backgroundColor,
    color,
    fontStyle: span.italic === true ? 'italic' : undefined,
    fontWeight: span.bold === true ? 'bold' : undefined,
    textDecoration: span.underline === true || span.link !== undefined ? 'underline' : undefined,
  }
}

function cursorShape(snapshot: TerminalSnapshot): string | null {
  const row = snapshot.cursorRow
  if (!snapshot.cursorVisible || row === undefined || row < 0 || row >= snapshot.lines.length) {
    return null
  }
  const style = snapshot.cursorStyle ?? 'default'
  return style === 'default' ? 'block' : style
}

export function TerminalPane({ onResize, palette, snapshot }: Props) {
  const root = useRef<HTMLDivElement>(null)
  const cell = useMemo(() => measureCell(TERMINAL_FONT), [])
  const style = useMemo(
    () => ({ '--cell-h': `${cell.height}px`, 'font': TERMINAL_FONT }) as CSSProperties,
    [cell]
  )
  const last = useRef('')
  const onResizeRef = useRef(onResize)
  onResizeRef.current = onResize

  useEffect(() => {
    const element = root.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      const { cols, rows } = gridSize(entry.contentRect, cell)
      const key = `${cols}x${rows}`
      if (key === last.current) return
      last.current = key
      onResizeRef.current(cols, rows)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [cell])

  const shape = snapshot ? cursorShape(snapshot) : null
  const blink = snapshot?.cursorBlink === true ? ' blink' : ''

  return (
    <div className="terminal" ref={root} style={style}>
      {snapshot?.lines.map((line, row) => (
        // oxlint-disable-next-line react/no-array-index-key -- rows are positional
        <div className="terminal-line" key={row}>
          {line.spans.map((span, i) => {
            const cursor = span.cursor === true && shape !== null
            return (
              <span
                // oxlint-disable-next-line react/no-array-index-key -- spans are positional
                key={i}
                className={cursor ? `cursor-${shape}${blink}` : undefined}
                style={spanStyle(span, palette, cursor && shape === 'block')}
                title={span.link}
              >
                {span.text}
              </span>
            )
          })}
        </div>
      ))}
    </div>
  )
}
