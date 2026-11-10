import { useLayoutEffect, useRef, useState } from 'react'

/** A pixel's side (px), the sweep across the bar, and how much each pixel jitters (ms). */
const CELL = 6
const SWEEP_MS = 260
const JITTER_MS = 70
const PIXEL_MS = 90

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** A fixed jitter per cell, so the edge looks ragged rather than random each frame. */
const noise = (x: number, y: number) => {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
  return n - Math.floor(n)
}

/**
 * The composer turning into a terminal and back: pixels of the old look are eaten from one
 * side (left to right going in, right to left coming back), each flashing tan before it
 * clears onto the new look underneath.
 */
export function PixelWipe({ on }: { on: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  const was = useRef(on)
  const [wipe, setWipe] = useState<{ cols: number; key: number; rows: number; to: boolean } | null>(
    null
  )

  // Before paint: the bar never shows its new look uncovered for a frame.
  useLayoutEffect(() => {
    if (was.current === on) return
    was.current = on
    const parent = box.current?.parentElement
    if (!parent || reduced()) return
    const cols = Math.ceil(parent.offsetWidth / CELL)
    const rows = Math.ceil(parent.offsetHeight / CELL)
    setWipe({ cols, key: Date.now(), rows, to: on })
    const done = setTimeout(() => setWipe(null), SWEEP_MS + JITTER_MS + PIXEL_MS)
    return () => clearTimeout(done)
  }, [on])

  const cells = []
  if (wipe) {
    for (let y = 0; y < wipe.rows; y++) {
      for (let x = 0; x < wipe.cols; x++) {
        const along = wipe.to ? x / wipe.cols : 1 - x / wipe.cols
        const delay = along * SWEEP_MS + noise(x, y) * JITTER_MS
        cells.push(<i key={`${x}.${y}`} style={{ animationDelay: `${delay}ms` }} />)
      }
    }
  }
  return (
    <div
      ref={box}
      aria-hidden
      key={wipe?.key}
      className="pixel-wipe"
      data-to={wipe && (wipe.to ? 'shell' : 'prompt')}
      style={wipe ? { gridTemplateColumns: `repeat(${wipe.cols}, ${CELL}px)` } : undefined}
    >
      {cells}
    </div>
  )
}
