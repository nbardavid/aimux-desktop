import type { TerminalSnapshot, TerminalSpan } from '@brimveyn/aimux-config'

import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'

import { blockRects, type Rect } from './blocks'
import { spanColor } from './colors'
import { gridSize, measureCell, type Size } from './grid'

export const CELL_HEIGHT = 19
export const TERMINAL_FONT = `12.5px/${CELL_HEIGHT}px "Geist Mono", monospace`

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

const BLOCK = /[\u2580-\u259f]/

function blockStyle(rects: Rect[], shade: number, cell: Size): CSSProperties {
  const fill =
    shade === 1 ? 'currentColor' : `color-mix(in srgb, currentColor ${shade * 100}%, transparent)`
  const px = (n: number) => `${n}px`
  return {
    backgroundImage: rects.map(() => `linear-gradient(${fill}, ${fill})`).join(', '),
    backgroundPosition: rects
      .map(([x0, y0]) => `${px(x0 * cell.width)} ${px(y0 * cell.height)}`)
      .join(', '),
    backgroundRepeat: 'no-repeat',
    backgroundSize: rects
      .map(([x0, y0, x1, y1]) => `${px((x1 - x0) * cell.width)} ${px((y1 - y0) * cell.height)}`)
      .join(', '),
    width: cell.width,
  }
}

/** Block elements become cell-sized boxes; the rest stays text. */
function renderText(text: string, cell: Size): ReactNode {
  if (!BLOCK.test(text)) return text
  const out: ReactNode[] = []
  let plain = ''
  for (const char of text) {
    const block = blockRects(char)
    if (!block) {
      plain += char
      continue
    }
    if (plain !== '') out.push(plain)
    plain = ''
    out.push(
      <span key={out.length} className="blk" style={blockStyle(block.rects, block.shade, cell)} />
    )
  }
  if (plain !== '') out.push(plain)
  return out
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
  const [cell, setCell] = useState(() => measureCell(TERMINAL_FONT))
  // The first measure may run before the web font loads; measure again once it has.
  useEffect(() => {
    void document.fonts.load(TERMINAL_FONT).then(() => setCell(measureCell(TERMINAL_FONT)))
  }, [])
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
                {renderText(span.text, cell)}
              </span>
            )
          })}
        </div>
      ))}
    </div>
  )
}
