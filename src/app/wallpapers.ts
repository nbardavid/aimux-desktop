// Chat backgrounds: living scenes drawn in characters on a grid. Each is a pure function of
// the grid's size and the time, so any frame can be drawn from scratch, at any size (the chat,
// or a thumbnail in Settings). Settings › Appearance picks one; None keeps the plain chat.

export const WALLPAPERS = ['None', 'Kites', 'Koi'] as const
export type Wallpaper = (typeof WALLPAPERS)[number]
export const WALLPAPER_SETTING = 'ui.wallpaper'
export const DEFAULT_WALLPAPER: Wallpaper = 'None'

export const isWallpaper = (name: unknown): name is Wallpaper =>
  typeof name === 'string' && (WALLPAPERS as readonly string[]).includes(name)

/** What a scene draws with. Columns and rows are cells; fractional ones round to the grid. */
export interface Paint {
  cols: number
  rows: number
  /** Seconds. */
  t: number
  /** The whole surface, top to bottom, through these stops (`at` from 0 to 1). */
  sky(stops: readonly (readonly [number, string])[]): void
  /** A dot in every cell, as opaque as `level` says (0 to 1; below 0.03 is none). */
  field(ink: string, level: (c: number, r: number) => number): void
  /** A square of colour carrying a glyph in a darker shade: a scene's "pixel". */
  tile(c: number, r: number, fill: string, ink: string, glyph: string): void
  /** A bare character. */
  glyph(c: number, r: number, ink: string, ch: string): void
}

export type Scene = (p: Paint) => void

/** A stable random number in [0, 1) for these integers. */
export function hash(a: number, b = 0, c = 0): number {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1440670441)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h = Math.imul(h ^ (h >>> 16), 2246822519)
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296
}

const wrap = (x: number, span: number) => ((x % span) + span) % span
const wave = (x: number) => 0.5 + 0.5 * Math.sin(x)

/** A tile's glyph: each one turns over now and then, on its own beat. */
export function flicker(set: string, a: number, b: number, t: number): string {
  const beat = Math.floor(t * 0.6 + hash(a, b, 9) * 8)
  return set[Math.floor(hash(a, b, beat) * set.length)] ?? set[0] ?? ' '
}

type Inks = Record<string, readonly [fill: string, ink: string]>

/** ASCII art as tiles: each letter is a colour from `inks`, spaces are holes. */
function sprite(
  p: Paint,
  art: readonly string[],
  c0: number,
  r0: number,
  inks: Inks,
  set: string,
  seed = 0
) {
  const c = Math.round(c0)
  const r = Math.round(r0)
  for (const [dr, line] of art.entries()) {
    for (let dc = 0; dc < line.length; dc++) {
      const pair = inks[line[dc] ?? ' ']
      if (pair) p.tile(c + dc, r + dr, pair[0], pair[1], flicker(set, dc + seed * 37, dr, p.t))
    }
  }
}

/** The stroke for something leaning by `lean`: upright within `upright` of zero. */
function slant(lean: number, upright: number, right: string, left: string): string {
  if (lean > upright) return right
  if (lean < -upright) return left
  return '|'
}

/** A line of characters from one cell to another, sagging by `sag` cells at its middle. */
function line(
  p: Paint,
  from: readonly [number, number],
  to: readonly [number, number],
  ink: string,
  sag = 0
) {
  const steps = Math.max(1, Math.abs(to[1] - from[1]))
  let prev = from[0]
  for (let i = 0; i <= steps; i++) {
    const u = i / steps
    const c = from[0] + (to[0] - from[0]) * u + Math.sin(Math.PI * u) * sag
    const lean = c - prev
    prev = c
    p.glyph(c, from[1] + (to[1] - from[1]) * u, ink, slant(lean, 0.3, '\\', '/'))
  }
}

// ── Kites ──────────────────────────────────────────────────────────────────────────────────

const KITE = [
  '    s',
  '   asb',
  '  aasbb',
  ' aaasbbb',
  'sssssssss',
  ' cccsddd',
  '  ccsdd',
  '   csd',
  '    s',
]

const CLOUDS = [
  ['   @@@@', ' @@@@@@@@@', '@@@@@@@@@@@@@', ' ooooooooooo'],
  ['  @@@', '@@@@@@@@', ' oooooo'],
  ['     @@@@@', '  @@@@@@@@@@', '@@@@@@@@@@@@@@@@', ' ooooooooooooo'],
]

const SPAR = ['rgba(74,62,56,0.8)', 'rgba(255,255,255,0.7)'] as const

const KITES: readonly { at: readonly [number, number]; inks: Inks; phase: number; tail: string }[] =
  [
    {
      at: [0.3, 0.12],
      inks: {
        a: ['#ef7d5f', '#b4482e'],
        b: ['#f6b25e', '#bf7a21'],
        c: ['#f6b25e', '#bf7a21'],
        d: ['#ef7d5f', '#b4482e'],
        s: SPAR,
      },
      phase: 0,
      tail: '#ef7d5f',
    },
    {
      at: [0.68, 0.3],
      inks: {
        a: ['#5fa8a0', '#2e716a'],
        b: ['#f2cf6b', '#b48f22'],
        c: ['#f2cf6b', '#b48f22'],
        d: ['#5fa8a0', '#2e716a'],
        s: SPAR,
      },
      phase: 2.1,
      tail: '#5fa8a0',
    },
  ]

/** Flying birds: a `v` that flaps. */
function birds(p: Paint, count: number, band: readonly [number, number], ink: string) {
  for (let i = 0; i < count; i++) {
    const c = wrap(p.t * (0.9 + hash(i, 1) * 0.8) + hash(i, 2) * p.cols, p.cols + 12) - 6
    const r = p.rows * (band[0] + (band[1] - band[0]) * hash(i, 3)) + Math.sin(p.t * 0.6 + i) * 0.8
    const up = Math.floor(p.t * 2.6 + hash(i, 4) * 2) % 2 === 0
    p.glyph(c, r, ink, up ? 'v' : '-')
  }
}

export const kites: Scene = (p) => {
  const { cols, rows, t } = p
  p.sky([
    [0, '#d4e6f4'],
    [0.6, '#e8f1f8'],
    [1, '#f5f8fb'],
  ])
  p.field(
    '#4f7fa8',
    (c, r) =>
      0.03 + 0.13 * wave(c * 0.31 + r * 0.17 + t * 0.8) * wave(r * 0.23 - t * 0.5 + c * 0.05)
  )
  for (let i = 0; i < 5; i++) {
    const art = CLOUDS[i % CLOUDS.length] ?? []
    const speed = 0.25 + 0.3 * hash(i, 1)
    const c = wrap(t * speed + hash(i, 3) * (cols + 20), cols + 20) - 17
    sprite(
      p,
      art,
      c,
      rows * (0.04 + 0.62 * hash(i, 2)),
      { '@': ['#ffffff', '#a9c2d9'], 'o': ['#e1ecf5', '#9fb8cf'] },
      '~=-:.',
      i
    )
  }
  birds(p, 3, [0.05, 0.22], 'rgba(58,72,94,0.55)')
  for (const kite of KITES) {
    const cx = Math.round(cols * kite.at[0] + 2.5 * Math.sin(t * 0.45 + kite.phase))
    const top = Math.round(rows * kite.at[1] + 1.5 * Math.sin(t * 0.7 + kite.phase))
    // The string runs down and out to whoever flies it, off screen.
    const out = kite.at[0] < 0.5 ? -1 : 1
    line(p, [cx, top + 5], [cx + out * 8, rows + 2], 'rgba(80,70,64,0.32)', -out * 2)
    for (let i = 0; i < 12; i++) {
      const c = cx + Math.sin(t * 2.2 - i * 0.55 + kite.phase) * (0.4 + i * 0.22)
      const r = top + 9 + i
      if (i % 3 === 2) p.tile(c, r, kite.tail, 'rgba(255,255,255,0.8)', '%')
      else p.glyph(c, r, 'rgba(80,70,64,0.5)', '~')
    }
    sprite(p, KITE, cx - 4, top, kite.inks, '%$#&*+x', kite.phase * 10)
  }
}

// ── Koi ────────────────────────────────────────────────────────────────────────────────────

type Point = readonly [number, number]

/** Coats in the pond's light: muted, so the fish sit in the water rather than on it. */
const KOI_INKS = {
  charcoal: ['#4e5d58', '#8e9f99'],
  cream: ['#e4e1c9', '#9f9a7c'],
  olive: ['#8db265', '#527636'],
  rust: ['#cf7650', '#86412a'],
  tan: ['#b99c5c', '#75602c'],
} as const satisfies Inks

type KoiInk = keyof typeof KOI_INKS

/**
 * Each fish: where it swims (a loop, as shares of the pane), how fast, and its coat: a base,
 * the patches over it, and for some a third colour in the patches' gaps.
 */
const FISH: readonly {
  at: Point
  reach: Point
  turns: Point
  speed: number
  coat: readonly [KoiInk, KoiInk, KoiInk?]
}[] = [
  { at: [0.36, 0.34], coat: ['cream', 'rust'], reach: [0.2, 0.22], speed: 0.05, turns: [1, 2] },
  { at: [0.64, 0.6], coat: ['tan', 'olive'], reach: [0.2, 0.26], speed: 0.045, turns: [2, 1] },
  {
    at: [0.42, 0.66],
    coat: ['cream', 'rust', 'charcoal'],
    reach: [0.24, 0.18],
    speed: 0.04,
    turns: [3, 2],
  },
]

/** How wide the body is (radius, in cells) at each point from the head: a koi's taper. */
const GIRTH = [
  1.5, 2.2, 2.6, 2.85, 2.95, 2.95, 2.85, 2.65, 2.4, 2.1, 1.8, 1.5, 1.2, 0.95, 0.75, 0.6, 0.5, 0.4,
]

/**
 * The fish's spine: points `step` cells apart along its loop, from the head back, so the body
 * bends the way it swims.
 */
function spine(
  fish: (typeof FISH)[number],
  cols: number,
  rows: number,
  t: number,
  step: number
): Point[] {
  const at = (s: number): Point => [
    cols * (fish.at[0] + fish.reach[0] * Math.sin(fish.turns[0] * s)),
    rows * (fish.at[1] + fish.reach[1] * Math.sin(fish.turns[1] * s + 0.9)),
  ]
  let s = t * fish.speed
  let prev = at(s)
  const points: Point[] = [prev]
  let run = 0
  for (let i = 0; i < 6000 && points.length < GIRTH.length; i++) {
    s -= 0.001
    const next = at(s)
    run += Math.hypot(next[0] - prev[0], next[1] - prev[1])
    prev = next
    if (run >= step) {
      run = 0
      points.push(next)
    }
  }
  return points
}

/** Where a cell sits on a body: inside or not, how far down it (`u`), and across it (-1 to 1). */
function onBody(points: readonly Point[], girth: (k: number) => number, c: number, r: number) {
  let edge = Infinity
  let u = 0
  let across = 0
  for (let k = 0; k + 1 < points.length; k++) {
    const a = points[k]
    const b = points[k + 1]
    if (!a || !b) continue
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const along = Math.min(
      1,
      Math.max(0, ((c - a[0]) * dx + (r - a[1]) * dy) / (dx * dx + dy * dy || 1))
    )
    const ex = c - (a[0] + dx * along)
    const ey = r - (a[1] + dy * along)
    const d = Math.hypot(ex, ey)
    const g = girth(k) + (girth(k + 1) - girth(k)) * along
    if (d - g < edge) {
      edge = d - g
      u = k + along
      across = (Math.sign(dx * ey - dy * ex) * d) / g
    }
  }
  return { across, inside: edge <= 0, u }
}

/** Every cell within `far` of `o` and within `half` radians of `dir`, past `near`. */
function wedge(
  o: Point,
  dir: number,
  half: number,
  near: number,
  far: number,
  draw: (c: number, r: number, d: number) => void
) {
  const reach = Math.ceil(far) + 1
  const c0 = Math.round(o[0])
  const r0 = Math.round(o[1])
  for (let dr = -reach; dr <= reach; dr++)
    for (let dc = -reach; dc <= reach; dc++) {
      const x = c0 + dc - o[0]
      const y = r0 + dr - o[1]
      const d = Math.hypot(x, y)
      if (d < near || d > far) continue
      if (Math.abs(wrap(Math.atan2(y, x) - dir + Math.PI, Math.PI * 2) - Math.PI) <= half)
        draw(c0 + dc, r0 + dr, d)
    }
}

/** Round pads, each with its notch; the first carries a lotus. */
const PADS: readonly { at: Point; r: number; notch: number }[] = [
  { at: [0.34, 0.2], notch: 0.6, r: 4.2 },
  { at: [0.66, 0.68], notch: 2.4, r: 3.6 },
  { at: [0.28, 0.74], notch: 4.1, r: 3 },
  { at: [0.72, 0.24], notch: 5.2, r: 4.8 },
  { at: [0.77, 0.29], notch: 1.2, r: 2.2 },
]

const LOTUS = [' p p ', 'ppypp', ' ppp ']

const FIN = ['rgba(226,244,236,0.4)', 'rgba(62,116,104,0.75)'] as const

export const koi: Scene = (p) => {
  const { cols, rows, t } = p
  // Fish at full size on a window, smaller on a narrow pane or a thumbnail.
  const scale = Math.min(1.1, Math.max(0.4, Math.min(cols / 80, rows / 48)))
  p.sky([
    [0, '#6dbfae'],
    [0.55, '#4ea493'],
    [1, '#3f9384'],
  ])
  // A dot in every cell, brighter where the light comes through the water.
  p.field(
    '#e4fbf3',
    (c, r) =>
      0.1 +
      0.3 *
        wave(c * 0.23 + Math.sin(r * 0.19 + t * 0.4) * 2 + t * 0.3) *
        wave(r * 0.21 - t * 0.35 + Math.sin(c * 0.13) * 1.5)
  )
  // Rings where something touched the surface.
  for (let i = 0; i < 5; i++) {
    const period = 6 + 3 * hash(i, 1)
    const cycle = Math.floor((t + hash(i, 2) * period) / period)
    const age = wrap(t + hash(i, 2) * period, period)
    const c0 = cols * (0.2 + 0.6 * hash(i, cycle, 3))
    const r0 = rows * (0.1 + 0.8 * hash(i, cycle, 4))
    const radius = age * 1.6
    const ink = `rgba(255,255,255,${(0.8 * (1 - age / period)).toFixed(2)})`
    const reach = Math.ceil(radius) + 1
    for (let dr = -reach; dr <= reach; dr++)
      for (let dc = -reach; dc <= reach; dc++)
        if (Math.abs(Math.hypot(dc, dr) - radius) < 0.5) p.glyph(c0 + dc, r0 + dr, ink, 'o')
  }
  // Each body as one smooth outline: cells inside it, wherever its spine bends and sways.
  const bodies = FISH.map((fish, i) => {
    const raw = spine(fish, cols, rows, t, scale)
    const girth = (k: number) => (GIRTH[k] ?? 0.4) * scale
    // A swimming wave down the body, stronger toward the tail.
    const points = raw.map((b, k): Point => {
      const a = raw[Math.max(0, k - 1)] ?? b
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
      const off = Math.sin(t * 3 - k * 0.45 + i) * 0.45 * scale * (k / GIRTH.length)
      return [b[0] - ((b[1] - a[1]) / len) * off, b[1] + ((b[0] - a[0]) / len) * off]
    })
    const cells: { c: number; r: number; u: number; across: number }[] = []
    const pad = 3 * scale + 1
    const xs = points.map((q) => q[0])
    const ys = points.map((q) => q[1])
    for (let r = Math.floor(Math.min(...ys) - pad); r <= Math.ceil(Math.max(...ys) + pad); r++)
      for (let c = Math.floor(Math.min(...xs) - pad); c <= Math.ceil(Math.max(...xs) + pad); c++) {
        const at = onBody(points, girth, c, r)
        if (at.inside) cells.push({ across: at.across, c, r, u: at.u })
      }
    return { cells, fish, girth, i, points }
  })
  // Shadows on the bottom first, under every fish.
  const drop = Math.max(1, Math.round(1.5 * scale))
  for (const { cells } of bodies)
    for (const cell of cells)
      p.tile(cell.c + drop, cell.r + drop, 'rgba(16,64,58,0.07)', 'rgba(0,0,0,0)', ' ')
  for (const { cells, fish, girth, i, points } of bodies) {
    const head = points[0]
    const neck = points[1]
    const tail = points.at(-1)
    const before = points.at(-2)
    if (!head || !neck || !tail || !before) continue
    const fin = (c: number, r: number, d: number) =>
      p.tile(c, r, FIN[0], FIN[1], flicker('~=-', Math.round(d * 2) + i * 13, i, t))
    // The tail fin fans out behind, beating; the pectoral fins paddle by the head.
    const back = Math.atan2(tail[1] - before[1], tail[0] - before[0])
    wedge(tail, back + Math.sin(t * 4 + i) * 0.45, 0.5, 0.5, 3.6 * scale, fin)
    const ahead = Math.atan2(head[1] - neck[1], head[0] - neck[0])
    const root = points[3] ?? head
    for (const side of [-1, 1])
      wedge(
        root,
        ahead + side * (Math.PI * 0.62 + Math.sin(t * 2.6 + i) * 0.2),
        0.35,
        girth(3),
        girth(3) + 2.4 * scale,
        fin
      )
    // The coat: patches that ride with the fish, worked out down and across its body.
    const seed = i * 2.3 + 1
    for (const { across, c, r, u } of cells) {
      const n =
        Math.sin(u * 0.7 + seed) +
        Math.sin(u * 0.31 + across * 1.6 + seed * 1.7) +
        0.7 * Math.sin(across * 2.3 - u * 0.5 + seed * 2.9)
      const third = fish.coat[2]
      let name = fish.coat[0]
      if (n > 0.5) name = fish.coat[1]
      else if (third && n < -1.2) name = third
      const ink = KOI_INKS[name]
      p.tile(
        c,
        r,
        ink[0],
        ink[1],
        flicker('tS%;$', Math.round(u * 2) + i * 41, Math.round(across * 3), t)
      )
    }
    // Two eyes on the head's sides.
    if (scale >= 0.6)
      for (const side of [-1, 1]) {
        const a = ahead + side * 1.05
        p.tile(
          head[0] + Math.cos(a) * 1.1 * scale,
          head[1] + Math.sin(a) * 1.1 * scale,
          '#33403c',
          '#6d7d77',
          'o'
        )
      }
  }
  // Pads float on top: the fish pass under them.
  for (const [i, pad] of PADS.entries()) {
    const c0 = cols * pad.at[0] + Math.sin(t * 0.12 + i) * 0.8
    const r0 = rows * pad.at[1] + Math.cos(t * 0.1 + i * 2) * 0.6
    const turn = pad.notch + Math.sin(t * 0.08 + i) * 0.3
    const radius = pad.r * Math.max(0.6, scale)
    const reach = Math.ceil(radius)
    for (let dr = -reach; dr <= reach; dr++)
      for (let dc = -reach; dc <= reach; dc++) {
        const d = Math.hypot(dc, dr)
        if (d > radius) continue
        // The notch: a wedge from the centre out.
        const off = Math.abs(wrap(Math.atan2(dr, dc) - turn + Math.PI, Math.PI * 2) - Math.PI)
        if (off < 0.32 && d > 0.6) continue
        const rim = d > radius - 1
        p.tile(
          c0 + dc,
          r0 + dr,
          rim ? '#6a9a50' : '#7fae62',
          rim ? '#3f6a2d' : '#4a7536',
          flicker(rim ? '%&' : '/\\|-', dc + i * 17, dr, t)
        )
      }
    if (i === 0)
      sprite(
        p,
        LOTUS,
        c0 - 2,
        r0 - 2,
        { p: ['#ee9fb4', '#b4566e'], y: ['#f4d06b', '#b48f22'] },
        '*%&',
        7
      )
  }
  // Petals drifting on the surface.
  for (let i = 0; i < 9; i++) {
    const c = wrap(cols * hash(i, 1) + t * (0.25 + 0.2 * hash(i, 2)), cols + 4) - 2
    const r = rows * hash(i, 3) + Math.sin(t * 0.3 + i) * 2
    p.tile(c, r, '#f0a7b9', '#b65a72', flicker('t%', i, 0, t))
  }
}

export const SCENES: Record<Exclude<Wallpaper, 'None'>, Scene> = {
  Kites: kites,
  Koi: koi,
}
