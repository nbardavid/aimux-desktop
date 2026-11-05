/** A filled rectangle inside one cell, in fractions of the cell: x0, y0, x1, y1. */
export type Rect = readonly [number, number, number, number]

// Quadrant blocks U+2596–U+259F as bits: 1 upper left, 2 upper right, 4 lower left, 8 lower right.
const QUADRANTS = [4, 8, 1, 13, 9, 7, 11, 2, 6, 14]
const QUADRANT_RECTS: Rect[] = [
  [0, 0, 0.5, 0.5],
  [0.5, 0, 1, 0.5],
  [0, 0.5, 0.5, 1],
  [0.5, 0.5, 1, 1],
]

/** Block elements (U+2580–U+259F) drawn as rectangles, as terminals draw them, so they fill the
 * cell edge to edge whatever the font has. `shade` is the fill's opacity. `null`: not a block. */
export function blockRects(char: string): { rects: Rect[]; shade: number } | null {
  const cp = char.codePointAt(0) ?? 0
  if (cp < 0x2580 || cp > 0x259f) return null
  const solid = (rects: Rect[]) => ({ rects, shade: 1 })
  if (cp === 0x2580) return solid([[0, 0, 1, 0.5]])
  if (cp <= 0x2588) return solid([[0, 1 - (cp - 0x2580) / 8, 1, 1]])
  if (cp <= 0x258f) return solid([[0, 0, (0x2590 - cp) / 8, 1]])
  if (cp === 0x2590) return solid([[0.5, 0, 1, 1]])
  if (cp <= 0x2593) return { rects: [[0, 0, 1, 1]], shade: (cp - 0x2590) / 4 }
  if (cp === 0x2594) return solid([[0, 0, 1, 0.125]])
  if (cp === 0x2595) return solid([[0.875, 0, 1, 1]])
  const bits = QUADRANTS[cp - 0x2596] ?? 0
  return solid(QUADRANT_RECTS.filter((_, i) => (bits & (1 << i)) !== 0))
}
