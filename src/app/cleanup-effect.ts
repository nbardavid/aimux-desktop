/**
 * Clean up's send-off. Before the worktree goes, `capture` copies the chat area (a frozen
 * clone, laid over the new view once it is gone) and reads every glyph on screen. `play` then
 * wipes that copy away, left to right, in the chosen style:
 * - Dust: the text crumbles into fine grains that blow off to the right;
 * - Brush: a wide paste brush, tilted in 3D, sweeps it clean, leaving a few glints;
 * - Glint: a band of light crosses it and it fades.
 * The sidebar row always crumbles. Reduced motion: the copy fades, nothing moves.
 */

import { invoke } from '@tauri-apps/api/core'

import type { Workspace } from '../model/catalog'

export const CLEANUP_EFFECTS = ['Dust', 'Brush', 'Glint', 'None'] as const
export type CleanupEffect = (typeof CLEANUP_EFFECTS)[number]

const SWEEP_MS = 340
const BRUSH_MS = 760
const MAX_GRAINS = 40_000
/** A grain's side in CSS px: under a point on a Retina screen. */
const GRAIN = 0.6
const ALPHA_LEVELS = 6

interface Grain {
  a: number
  color: number
  delay: number
  life: number
  vx: number
  vy: number
  x: number
  y: number
}

interface Capture {
  ghost: HTMLElement | null
  rect: DOMRect
  colors: string[]
  grains: Grain[]
  restoreScroll: () => void
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

async function tween(ms: number, step: (p: number, t: number) => void, ease = easeInOut) {
  return new Promise<void>((resolve) => {
    const start = performance.now()
    const frame = (now: number) => {
      const t = Math.min(1, (now - start) / ms)
      step(ease(t), t)
      if (t < 1) requestAnimationFrame(frame)
      else resolve()
    }
    requestAnimationFrame(frame)
  })
}

/* ---------- Capture ---------- */

/** The part of `el` its clipping ancestors (up to `root`) leave on screen. */
function visibleBox(el: Element, root: Element, cache: Map<Element, DOMRect>): DOMRect {
  const hit = cache.get(el)
  if (hit) return hit
  let box = new DOMRect(0, 0, innerWidth, innerHeight)
  if (el !== root && el.parentElement) box = visibleBox(el.parentElement, root, cache)
  if (getComputedStyle(el).overflow !== 'visible') {
    const r = el.getBoundingClientRect()
    const left = Math.max(box.left, r.left)
    const top = Math.max(box.top, r.top)
    box = new DOMRect(
      left,
      top,
      Math.max(0, Math.min(box.right, r.right) - left),
      Math.max(0, Math.min(box.bottom, r.bottom) - top)
    )
  }
  cache.set(el, box)
  return box
}

const inside = (r: DOMRect, box: DOMRect) =>
  r.width > 0 &&
  r.left >= box.left - 1 &&
  r.right <= box.right + 1 &&
  r.top >= box.top - 1 &&
  r.bottom <= box.bottom + 1

/** Draws every visible character under `roots` where it sits, in its own font and colour. */
function drawGlyphs(ctx: CanvasRenderingContext2D, roots: Element[]) {
  const range = document.createRange()
  const cache = new Map<Element, DOMRect>()
  ctx.textBaseline = 'middle'
  for (const root of roots) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent ?? ''
      const parent = node.parentElement
      if (!parent || text.trim() === '') continue
      const box = visibleBox(parent, root, cache)
      range.selectNodeContents(node)
      const all = range.getBoundingClientRect()
      if (
        all.bottom < box.top ||
        all.top > box.bottom ||
        all.right < box.left ||
        all.left > box.right
      )
        continue
      const css = getComputedStyle(parent)
      if (css.visibility === 'hidden') continue
      ctx.font = `${css.fontStyle} ${css.fontWeight} ${css.fontSize} ${css.fontFamily}`
      ctx.fillStyle = css.color
      for (let i = 0; i < text.length; i++) {
        const ch = text.charAt(i)
        if (ch.trim() === '') continue
        range.setStart(node, i)
        range.setEnd(node, i + 1)
        const r = range.getBoundingClientRect()
        if (inside(r, box)) ctx.fillText(ch, r.left, r.top + r.height / 2)
      }
    }
  }
}

/** Every inked device pixel under `roots`, as a grain; `delayOf` says when it lets go. */
function grainsOf(roots: Element[], delayOf: (x: number) => number) {
  const dpr = devicePixelRatio || 1
  let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const root of roots) {
    const r = root.getBoundingClientRect()
    left = Math.min(left, r.left)
    top = Math.min(top, r.top)
    right = Math.max(right, r.right)
    bottom = Math.max(bottom, r.bottom)
  }
  const union = new DOMRect(left, top, right - left, bottom - top)
  const w = Math.ceil(union.width * dpr)
  const h = Math.ceil(union.height * dpr)
  const colors: string[] = []
  const grains: Grain[] = []
  if (w === 0 || h === 0) return { colors, grains }
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return { colors, grains }
  ctx.setTransform(dpr, 0, 0, dpr, -union.left * dpr, -union.top * dpr)
  drawGlyphs(ctx, roots)
  const data = ctx.getImageData(0, 0, w, h).data
  const index = new Map<string, number>()
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const [r = 0, g = 0, b = 0, a = 0] = data.subarray(i, i + 4)
      if (a < 60) continue
      // Antialiasing varies the shade a little: a handful of colours, one fill each per frame.
      const key = `rgb(${r & 0xf0} ${g & 0xf0} ${b & 0xf0})`
      let color = index.get(key)
      if (color === undefined) {
        color = colors.push(key) - 1
        index.set(key, color)
      }
      const px = union.left + x / dpr
      grains.push({
        a: a / 255,
        color,
        delay: delayOf(px),
        life: 450 + Math.random() * 380,
        vx: 0.4 + Math.random() * 3,
        vy: -(Math.random() * 1.4),
        x: px,
        y: union.top + y / dpr,
      })
    }
  // ponytail: random thinning past MAX_GRAINS keeps a full transcript at 60fps; finer needs WebGL.
  if (grains.length <= MAX_GRAINS) return { colors, grains }
  const keep = MAX_GRAINS / grains.length
  return { colors, grains: grains.filter(() => Math.random() < keep) }
}

/** A frozen copy of the chat area, scrolled where it was, to lay over the new view. */
function ghostOf(main: HTMLElement, rect: DOMRect) {
  const ghost = main.cloneNode(true) as HTMLElement
  const from = main.querySelectorAll('*')
  const to = ghost.querySelectorAll('*')
  const scrolls: [Element, number, number][] = []
  for (const [i, el] of [...from].entries()) {
    const twin = to[i]
    if (twin && (el.scrollTop || el.scrollLeft)) scrolls.push([twin, el.scrollTop, el.scrollLeft])
  }
  ghost.inert = true
  ghost.setAttribute('aria-hidden', 'true')
  Object.assign(ghost.style, {
    background: 'var(--background)',
    height: `${rect.height}px`,
    left: `${rect.left}px`,
    margin: '0',
    pointerEvents: 'none',
    position: 'fixed',
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    zIndex: '90',
  })
  const restoreScroll = () => {
    for (const [el, top, left] of scrolls) {
      el.scrollTop = top
      el.scrollLeft = left
    }
  }
  return { ghost, restoreScroll }
}

/** `main` is the area the effect wipes; `row` only crumbles. */
function capture(
  effect: CleanupEffect,
  main: HTMLElement | null,
  row: Element | null
): Capture | null {
  if (effect === 'None') return null
  const rect = main?.getBoundingClientRect() ?? new DOMRect()
  const { ghost, restoreScroll } = main
    ? ghostOf(main, rect)
    : { ghost: null, restoreScroll: () => {} }
  if (matchMedia('(prefers-reduced-motion: reduce)').matches)
    return { colors: [], ghost, grains: [], rect, restoreScroll }
  const roots = [effect === 'Dust' ? main : null, row].filter((r): r is Element => r !== null)
  // The chat lets go as the sweep passes; the sidebar row at once.
  const delayOf = (x: number) =>
    x >= rect.left
      ? ((x - rect.left) / rect.width) * SWEEP_MS + Math.random() * 50
      : Math.random() * 120
  const { colors, grains } = roots.length ? grainsOf(roots, delayOf) : { colors: [], grains: [] }
  return { colors, ghost, grains, rect, restoreScroll }
}

/* ---------- Particles ---------- */

interface Star {
  born: number
  life: number
  size: number
  x: number
  y: number
  color: string
}

/** One canvas over the window that draws grains and stars until both run out. */
function particles(colors: string[], grains: Grain[]) {
  const canvas = document.createElement('canvas')
  const dpr = devicePixelRatio || 1
  canvas.width = innerWidth * dpr
  canvas.height = innerHeight * dpr
  canvas.style.cssText =
    'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:100'
  document.body.append(canvas)
  const ctx = canvas.getContext('2d')
  const stars: Star[] = []
  let open = true
  const start = performance.now()
  let last = start
  const star = (s: Star) => {
    const k = (performance.now() - s.born) / s.life
    const r = s.size * Math.sin(Math.PI * Math.min(1, Math.max(0, k)))
    if (!ctx || r <= 0) return
    ctx.globalAlpha = 1 - k * k
    ctx.fillStyle = s.color
    ctx.beginPath()
    ctx.moveTo(s.x, s.y - r)
    ctx.quadraticCurveTo(s.x, s.y, s.x + r, s.y)
    ctx.quadraticCurveTo(s.x, s.y, s.x, s.y + r)
    ctx.quadraticCurveTo(s.x, s.y, s.x - r, s.y)
    ctx.quadraticCurveTo(s.x, s.y, s.x, s.y - r)
    ctx.fill()
  }
  const frame = (now: number) => {
    if (!ctx) return canvas.remove()
    const t = now - start
    // Time-based, so a 120Hz screen blows no faster than a 60Hz one.
    const f = (now - last) / 16.7
    last = now
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, innerWidth, innerHeight)
    const paths: (Path2D | undefined)[] = []
    let alive = false
    for (const g of grains) {
      const age = t - g.delay
      if (age >= g.life) continue
      alive = true
      if (age > 0) {
        g.x += g.vx * f
        g.y += g.vy * f
        g.vy += (Math.random() - 0.62) * 0.04 * f
        g.vx *= 0.985 ** f
      }
      const k = Math.max(0, age) / g.life
      const alpha = g.a * (1 - k * k * k)
      const level = Math.min(ALPHA_LEVELS - 1, Math.floor(alpha * ALPHA_LEVELS))
      ;(paths[g.color * ALPHA_LEVELS + level] ??= new Path2D()).rect(g.x, g.y, GRAIN, GRAIN)
    }
    for (const [i, path] of paths.entries()) {
      if (!path) continue
      ctx.globalAlpha = ((i % ALPHA_LEVELS) + 0.5) / ALPHA_LEVELS
      ctx.fillStyle = colors[Math.floor(i / ALPHA_LEVELS)] ?? '#000'
      ctx.fill(path)
    }
    for (let i = stars.length - 1; i >= 0; i--) {
      const s = stars[i]
      if (s && now - s.born < s.life) {
        alive = true
        star(s)
      } else stars.splice(i, 1)
    }
    if (alive || open) requestAnimationFrame(frame)
    else canvas.remove()
  }
  requestAnimationFrame(frame)
  return {
    /** Grains and stars added from now on still play; the canvas goes once they are done. */
    close: () => {
      open = false
    },
    color: (c: string) => {
      const i = colors.indexOf(c)
      return i === -1 ? colors.push(c) - 1 : i
    },
    grain: (g: Omit<Grain, 'delay'>) => grains.push({ ...g, delay: performance.now() - start }),
    star: (s: Omit<Star, 'born'>) => stars.push({ ...s, born: performance.now() }),
  }
}

/* ---------- The three styles ---------- */

function brushSvg(height: number) {
  let fibers = ''
  for (let y = 26; y < 298; y += 4) {
    const start = 6 + Math.random() * 7
    const tone = Math.random() < 0.5 ? '#a8826d' : '#d9bba8'
    fibers += `<line x1="${start.toFixed(1)}" y1="${y}" x2="54" y2="${y}" stroke="${tone}" stroke-width="1.4" stroke-linecap="round" opacity=".75"/>`
  }
  return `<svg viewBox="0 0 140 320" height="${height}" width="${(height * 140) / 320}" aria-hidden="true">
    <defs>
      <linearGradient id="cfx-b" x1="0" x2="1"><stop offset="0" stop-color="#d4b29d"/><stop offset=".55" stop-color="#c29c87"/><stop offset="1" stop-color="#a98470"/></linearGradient>
      <linearGradient id="cfx-m" x1="0" x2="1"><stop offset="0" stop-color="#e9ebed"/><stop offset=".4" stop-color="#b9bec4"/><stop offset=".7" stop-color="#f4f5f6"/><stop offset="1" stop-color="#9aa0a7"/></linearGradient>
      <linearGradient id="cfx-w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a4644"/><stop offset=".5" stop-color="#282725"/><stop offset="1" stop-color="#3d3a38"/></linearGradient>
    </defs>
    <path d="M56 20 H22 Q10 22 8 40 L6 286 Q6 302 20 302 H56 Z" fill="url(#cfx-b)"/>
    ${fibers}
    <rect x="52" y="14" width="24" height="294" rx="5" fill="url(#cfx-m)"/>
    <line x1="58" y1="18" x2="58" y2="304" stroke="#8d939a" stroke-width="1"/>
    <line x1="70" y1="18" x2="70" y2="304" stroke="#8d939a" stroke-width="1"/>
    <path d="M76 126 L128 138 Q136 140 136 150 L136 176 Q136 186 128 188 L76 200 Z" fill="url(#cfx-w)"/>
    <circle cx="126" cy="163" r="4" fill="#fafaf9" opacity=".9"/>
  </svg>`
}

async function brush(c: Capture, fx: ReturnType<typeof particles>) {
  const { ghost, rect } = c
  if (!ghost) return
  const height = rect.height * 0.92
  // The brush stays inside the chat area: it sweeps that, not the panels beside it.
  const frame = document.createElement('div')
  frame.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;overflow:hidden;z-index:95;pointer-events:none`
  const el = document.createElement('div')
  el.innerHTML = brushSvg(height)
  el.style.cssText = `position:absolute;left:0;top:${rect.height * 0.04}px;will-change:transform;filter:drop-shadow(14px 18px 16px rgb(40 39 37 / .22))`
  frame.append(el)
  document.body.append(frame)
  const width = (height * 140) / 320
  const dust = fx.color('rgb(176 170 164)')
  const glints = ['#c29c87', '#e0b25a']
  await tween(BRUSH_MS, (p, t) => {
    const x = -width * 1.1 + p * (rect.width + width * 1.7)
    const tilt = Math.sin(t * Math.PI)
    el.style.transform = `perspective(${height * 2.3}px) translateX(${x}px) translateY(${-4 + tilt * 8}px) rotateY(${-38 + tilt * 10}deg) rotateZ(${-6 + tilt * 5}deg)`
    const b = el.getBoundingClientRect()
    const wipe = Math.max(0, b.left - rect.left + b.width * 0.12)
    ghost.style.clipPath = `inset(0 0 0 ${Math.min(rect.width, wipe)}px)`
    if (wipe < 30 || wipe > rect.width - 10) return
    // Dust pushed ahead of the bristles, and a few glints left on the clean side.
    for (let i = 0; i < 6; i++)
      fx.grain({
        a: 0.8,
        color: dust,
        life: 200 + Math.random() * 160,
        vx: 2.5 + Math.random() * 2.5,
        vy: (Math.random() - 0.5) * 0.6,
        x: rect.left + wipe + 2,
        y: rect.top + Math.random() * rect.height,
      })
    if (Math.random() < 0.35)
      fx.star({
        color: glints[Math.round(Math.random())] ?? '#c29c87',
        life: 480 + Math.random() * 200,
        size: 3 + Math.random() * 3.5,
        x: rect.left + wipe - 8 - Math.random() * 40,
        y: rect.top + 20 + Math.random() * (rect.height - 40),
      })
  })
  frame.remove()
  ghost.remove()
  fx.star({
    color: '#c29c87',
    life: 420,
    size: 14,
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  })
}

async function glint(c: Capture) {
  const { ghost, rect } = c
  if (!ghost) return
  const band = document.createElement('div')
  band.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;overflow:hidden;z-index:95;pointer-events:none`
  band.innerHTML =
    '<div style="position:absolute;inset:0 auto 0 -220px;width:220px;background:linear-gradient(100deg,transparent 20%,rgb(255 255 255 / .95) 50%,transparent 80%)"></div>'
  document.body.append(band)
  const light = band.firstElementChild as HTMLElement
  const crossing = light.animate(
    [{ transform: 'none' }, { transform: `translateX(${rect.width + 440}px)` }],
    {
      duration: 420,
      easing: 'cubic-bezier(.4,0,.2,1)',
    }
  ).finished
  await ghost.animate(
    [
      { opacity: 1, transform: 'none' },
      { opacity: 0, transform: 'translateX(-8px)' },
    ],
    {
      delay: 140,
      duration: 220,
      easing: 'ease-in',
      fill: 'forwards',
    }
  ).finished
  ghost.remove()
  await crossing
  band.remove()
}

async function dust(c: Capture) {
  const { ghost, rect } = c
  if (!ghost) return
  // The copy's ink lets go as the front passes: what is left of it is cut away behind.
  await tween(
    SWEEP_MS,
    (p) => {
      ghost.style.clipPath = `inset(0 0 0 ${p * rect.width}px)`
    },
    (t) => t
  )
  ghost.remove()
}

async function play(effect: CleanupEffect, c: Capture) {
  if (c.ghost) {
    document.body.append(c.ghost)
    c.restoreScroll()
  }
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    await c.ghost?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' })
      .finished
    c.ghost?.remove()
    return
  }
  const fx = particles(c.colors, c.grains)
  try {
    if (effect === 'Brush') await brush(c, fx)
    else if (effect === 'Glint') await glint(c)
    else await dust(c)
  } finally {
    c.ghost?.remove()
    fx.close()
  }
}

/** Settings › Appearance; Dust when unset or unreadable. */
async function chosenEffect(): Promise<CleanupEffect> {
  try {
    const read = await invoke<{ settings: Record<string, unknown> }>('read_settings')
    return CLEANUP_EFFECTS.find((e) => e === read.settings['ui.cleanupEffect']) ?? 'Dust'
  } catch {
    return 'Dust'
  }
}

/** The git panel's Clean up: captures the workspace, removes it, then plays the send-off.
 * A refusal (uncommitted changes) throws before anything moves. */
export function cleanupOf(
  ws: Workspace | undefined,
  remove: (w: Workspace, force: boolean) => Promise<void>
) {
  if (ws === undefined) return null
  return {
    label: 'Clean up',
    run: async (force: boolean) => {
      const effect = await chosenEffect()
      const shot = capture(
        effect,
        document.querySelector('main'),
        document.querySelector(`[data-workspace="${ws.id}"]`)
      )
      await remove(ws, force)
      if (shot) void play(effect, shot)
    },
  }
}

let previewing = false

/** Settings: plays `effect` over `area`, which steps aside meanwhile and comes back after. */
export async function previewCleanup(effect: string, area: HTMLElement | null) {
  const chosen = CLEANUP_EFFECTS.find((e) => e === effect)
  const shot = chosen && area && !previewing ? capture(chosen, area, null) : null
  if (!chosen || !area || !shot) return
  previewing = true
  area.style.opacity = '0'
  try {
    await play(chosen, shot)
  } finally {
    area.style.opacity = ''
    area.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' })
    previewing = false
  }
}
