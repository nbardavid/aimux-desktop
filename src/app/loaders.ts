// Braille loaders, after gunnargray-dev/unicode-animations (MIT). Each braille glyph is a
// 2×4 grid of dots; a frame is a row of them. Settings › Appearance picks the chat's, and
// the one every working status (sidebar, tabs, tool rows) draws as dots.

/** Dot `[row, column]`'s bit in its glyph (rows 0–3, columns 0–1 within the glyph). */
const BIT = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80],
] as const

type Dot = readonly [number, number]

/** A frame `columns` dots wide (two per glyph) with the dots `lit` at `[row, column]`. */
export function braille(columns: number, lit: Iterable<Dot>): string {
  const codes = Array.from({ length: Math.ceil(columns / 2) }, () => 0x2800)
  for (const [row, col] of lit) {
    const glyph = Math.floor(col / 2)
    const bit = BIT[row]?.[col % 2]
    if (codes[glyph] !== undefined && bit !== undefined) codes[glyph] |= bit
  }
  return String.fromCodePoint(...codes)
}

/** The dots a frame lights, as `[row, column]`, the inverse of `braille`. */
export function litDots(frame: string): Dot[] {
  const lit: Dot[] = []
  // Braille sits in the BMP: one UTF-16 unit per glyph.
  for (let g = 0; g < frame.length; g++) {
    const code = frame.charCodeAt(g) - 0x2800
    for (const [row, bits] of BIT.entries())
      for (const [col, bit] of bits.entries()) if (code & bit) lit.push([row, g * 2 + col])
  }
  return lit
}

/** A `columns`×4 frame with the dots `on` says are lit. */
function grid(columns: number, on: (row: number, col: number) => boolean): string {
  const lit: Dot[] = []
  for (let r = 0; r < 4; r++) for (let c = 0; c < columns; c++) if (on(r, c)) lit.push([r, c])
  return braille(columns, lit)
}

const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => from + i)

/** A bright line sweeping across. */
const scan = () => range(-1, 9).map((pos) => grid(8, (_, c) => c === pos || c === pos - 1))

/** Drops falling at their own pace. */
function rain() {
  const offsets = [0, 3, 1, 5, 2, 7, 4, 6]
  return range(0, 12).map((f) => grid(8, (r, c) => (f + (offsets[c] ?? 0)) % 6 === r))
}

/** A line going up and down, its trail dotted. */
const scanline = () =>
  [0, 1, 2, 3, 2, 1].map((row) => grid(6, (r, c) => r === row || (r === row - 1 && c % 2 === 0)))

/** A ring opening out from the centre. */
const pulse = () =>
  [0.5, 1.2, 2, 3, 3.5].map((radius) =>
    grid(6, (r, c) => Math.abs(Math.hypot(c - 2.5, r - 1.5) - radius) < 0.9)
  )

/** Four dots winding through a square, row by row. */
function snake() {
  const path = range(0, 4).flatMap((r) =>
    (r % 2 === 0 ? range(0, 4) : range(0, 4).reverse()).map((c): Dot => [r, c])
  )
  return path.map((_, i) =>
    braille(
      4,
      range(0, 4)
        .map((t) => path.at(i - t))
        .filter((dot) => dot !== undefined)
    )
  )
}

/** Stars twinkling. */
function sparkle() {
  const patterns = [
    '10010010001001000100100110000100',
    '01001001100100010001010000101010',
    '00100100010000101010000101010001',
    '10000011001010000000101010010010',
    '00011000010001011001000001000101',
    '01100001000100100100010000101000',
  ]
  return patterns.map((p) => grid(8, (r, c) => p[r * 8 + c] === '1'))
}

/** A diagonal band sweeping across. */
const cascade = () =>
  range(-2, 12).map((offset) => grid(8, (r, c) => r + c === offset || r + c === offset - 1))

/** Columns filling up one after the other. */
function columns() {
  const frames = range(0, 6).flatMap((col) =>
    [3, 2, 1, 0].map((fillTo) => grid(6, (r, c) => c < col || (c === col && r >= fillTo)))
  )
  return [...frames, grid(6, () => true), grid(6, () => false)]
}

/** Two dots chasing each other round one glyph. */
function orbit() {
  const path: Dot[] = [
    [0, 0],
    [0, 1],
    [1, 1],
    [2, 1],
    [3, 1],
    [3, 0],
    [2, 0],
    [1, 0],
  ]
  return path.map((head, i) => braille(2, [head, path.at(i - 1) ?? head]))
}

/** One glyph filling and emptying. */
function breathe() {
  const stages: Dot[][] = [
    [],
    [[1, 0]],
    [
      [0, 1],
      [2, 0],
    ],
    [
      [0, 0],
      [1, 1],
      [3, 0],
    ],
    [
      [0, 0],
      [1, 1],
      [2, 0],
      [3, 1],
    ],
    [
      [0, 0],
      [0, 1],
      [1, 1],
      [2, 0],
      [3, 1],
    ],
    [
      [0, 0],
      [0, 1],
      [1, 0],
      [2, 1],
      [3, 0],
      [3, 1],
    ],
    [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
      [2, 0],
      [3, 0],
      [3, 1],
    ],
    [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
      [2, 0],
      [2, 1],
      [3, 0],
      [3, 1],
    ],
  ]
  return [...stages, ...[...stages].reverse().slice(1)].map((dots) => braille(2, dots))
}

/** A sine wave rolling along, with spray. */
const waverows = () =>
  range(0, 16).map((f) =>
    grid(8, (r, c) => {
      const row = Math.round(((Math.sin((f - c * 0.5) * 0.8) + 1) / 2) * 3)
      return r === row || (r === row - 1 && (f + c) % 3 === 0)
    })
  )

/** A checkerboard flipping. */
const checkerboard = () =>
  range(0, 4).map((phase) => grid(6, (r, c) => (r + c + phase) % (phase < 2 ? 2 : 3) === 0))

/** Two sine strands crossing. */
function helix() {
  const row = (phase: number) => Math.round(((Math.sin(phase) + 1) / 2) * 3)
  return range(0, 16).map((f) =>
    grid(8, (r, c) => {
      const phase = ((f + c) * Math.PI) / 4
      return r === row(phase) || r === row(phase + Math.PI)
    })
  )
}

/** A square filling from the bottom, then draining. */
const fillsweep = () => [
  ...[3, 2, 1, 0].map((row) => grid(4, (r) => r >= row)),
  grid(4, () => true),
  grid(4, () => true),
  ...range(0, 4).map((row) => grid(4, (r) => r > row)),
  grid(4, () => false),
]

/** A square wiped in and out on the diagonal. */
const diagswipe = () => [
  ...range(0, 7).map((d) => grid(4, (r, c) => r + c <= d)),
  grid(4, () => true),
  ...range(0, 7).map((d) => grid(4, (r, c) => r + c > d)),
  grid(4, () => false),
]

const fixed = (codes: number[][]) => codes.map((glyphs) => String.fromCodePoint(...glyphs))

/** Every loader, by name. */
export const LOADERS = {
  braille: {
    frames: fixed([
      [0x280b],
      [0x2819],
      [0x2839],
      [0x2838],
      [0x283c],
      [0x2834],
      [0x2826],
      [0x2827],
      [0x2807],
      [0x280f],
    ]),
    interval: 80,
  },
  braillewave: {
    frames: fixed([
      [0x2801, 0x2802, 0x2804, 0x2840],
      [0x2802, 0x2804, 0x2840, 0x2880],
      [0x2804, 0x2840, 0x2880, 0x2820],
      [0x2840, 0x2880, 0x2820, 0x2810],
      [0x2880, 0x2820, 0x2810, 0x2808],
      [0x2820, 0x2810, 0x2808, 0x2801],
      [0x2810, 0x2808, 0x2801, 0x2802],
      [0x2808, 0x2801, 0x2802, 0x2804],
    ]),
    interval: 100,
  },
  breathe: { frames: breathe(), interval: 100 },
  cascade: { frames: cascade(), interval: 60 },
  checkerboard: { frames: checkerboard(), interval: 250 },
  columns: { frames: columns(), interval: 60 },
  diagswipe: { frames: diagswipe(), interval: 60 },
  dna: {
    frames: fixed([
      [0x280b, 0x2809, 0x2819, 0x281a],
      [0x2809, 0x2819, 0x281a, 0x2812],
      [0x2819, 0x281a, 0x2812, 0x2802],
      [0x281a, 0x2812, 0x2802, 0x2802],
      [0x2812, 0x2802, 0x2802, 0x2812],
      [0x2802, 0x2802, 0x2812, 0x2832],
      [0x2802, 0x2812, 0x2832, 0x2834],
      [0x2812, 0x2832, 0x2834, 0x2824],
      [0x2832, 0x2834, 0x2824, 0x2804],
      [0x2834, 0x2824, 0x2804, 0x280b],
      [0x2824, 0x2804, 0x280b, 0x2809],
      [0x2804, 0x280b, 0x2809, 0x2819],
    ]),
    interval: 80,
  },
  fillsweep: { frames: fillsweep(), interval: 100 },
  helix: { frames: helix(), interval: 80 },
  orbit: { frames: orbit(), interval: 100 },
  pulse: { frames: pulse(), interval: 180 },
  rain: { frames: rain(), interval: 100 },
  scan: { frames: scan(), interval: 70 },
  scanline: { frames: scanline(), interval: 120 },
  snake: { frames: snake(), interval: 80 },
  sparkle: { frames: sparkle(), interval: 150 },
  waverows: { frames: waverows(), interval: 90 },
} as const satisfies Record<string, { frames: string[]; interval: number }>

export type Loader = keyof typeof LOADERS

/** The order Settings shows them in: the wide ones first, then the square, then the single glyphs. */
export const LOADER_NAMES: Loader[] = [
  'helix',
  'rain',
  'waverows',
  'dna',
  'braillewave',
  'sparkle',
  'scan',
  'cascade',
  'pulse',
  'columns',
  'scanline',
  'checkerboard',
  'snake',
  'fillsweep',
  'diagswipe',
  'orbit',
  'breathe',
  'braille',
]

/** How Settings names them. */
export const LOADER_LABELS: Record<Loader, string> = {
  braille: 'Braille',
  braillewave: 'Ripple',
  breathe: 'Breathe',
  cascade: 'Cascade',
  checkerboard: 'Checker',
  columns: 'Columns',
  diagswipe: 'Swipe',
  dna: 'DNA',
  fillsweep: 'Fill',
  helix: 'Helix',
  orbit: 'Orbit',
  pulse: 'Pulse',
  rain: 'Rain',
  scan: 'Scan',
  scanline: 'Scan line',
  snake: 'Snake',
  sparkle: 'Sparkle',
  waverows: 'Wave',
}

/** The loaders small enough for a status: at most two glyphs, a square of dots. */
export const STATUS_LOADERS: Loader[] = [
  'diagswipe',
  'fillsweep',
  'snake',
  'orbit',
  'breathe',
  'braille',
]

/**
 * The loaders Settings › Appearance keeps: the two the chat's live line plays, and the
 * status one, drawn wherever something works (sidebar, tabs, tool rows, PR, setup).
 */
export interface LoaderChoice {
  working: Loader
  thinking: Loader
  status: Loader
}

export const LOADER_SETTINGS = {
  status: 'ui.statusLoader',
  thinking: 'ui.thinkingLoader',
  working: 'ui.workingLoader',
} as const satisfies Record<keyof LoaderChoice, string>

export const DEFAULT_LOADERS: LoaderChoice = {
  status: 'diagswipe',
  thinking: 'rain',
  working: 'helix',
}

export const isLoader = (name: unknown): name is Loader =>
  typeof name === 'string' && Object.hasOwn(LOADERS, name)

/** Whether `name` may fill the `key` setting: the status one takes only the square loaders. */
export const fitsSetting = (key: keyof LoaderChoice, name: unknown): name is Loader =>
  isLoader(name) && (key !== 'status' || STATUS_LOADERS.includes(name))

/** The frame a loader shows at `now`: every loader of a kind runs in step with the others. */
export function frameAt(loader: Loader, now: number): string {
  const { frames, interval } = LOADERS[loader]
  return frames[Math.floor(now / interval) % frames.length] ?? ''
}

/** The frame a still loader holds (reduced motion): the one that lights the most dots. */
export function stillFrame(loader: Loader): string {
  let fullest = ''
  for (const frame of LOADERS[loader].frames)
    if (litDots(frame).length > litDots(fullest).length) fullest = frame
  return fullest
}
