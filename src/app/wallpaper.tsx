import { invoke } from '@tauri-apps/api/core'
import { useEffect, useRef, useSyncExternalStore } from 'react'

import { cn } from '@/lib/utils'

import {
  DEFAULT_WALLPAPER,
  isWallpaper,
  type Paint,
  SCENES,
  type Wallpaper,
  WALLPAPER_SETTING,
} from './wallpapers'

/** Frames a second: the scenes move cell by cell, so more would only cost. */
const FPS = 24

/** A Paint onto a 2D context, `cell` CSS pixels a cell; small cells drop the glyphs. */
function painter(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cell: number,
  t: number
): Paint {
  const cols = Math.ceil(w / cell)
  const rows = Math.ceil(h / cell)
  const glyphs = cell >= 9
  const inside = (c: number, r: number) => c >= 0 && r >= 0 && c < cols && r < rows
  ctx.font = `600 ${Math.round(cell * 0.68)}px "Geist Mono", ui-monospace, monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const gap = glyphs ? 1 : 0
  return {
    cols,
    field(ink, level) {
      // Dots grouped by how opaque they are: one path and one fill per group.
      const size = Math.max(1, cell * 0.11)
      const groups: Path2D[] = Array.from({ length: 8 }, () => new Path2D())
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          const v = level(c, r)
          if (v < 0.03) continue
          const g = Math.min(7, Math.floor(v * 16))
          groups[g]?.rect(c * cell + (cell - size) / 2, r * cell + (cell - size) / 2, size, size)
        }
      ctx.fillStyle = ink
      for (const [g, path] of groups.entries()) {
        ctx.globalAlpha = (g + 0.5) / 16
        ctx.fill(path)
      }
      ctx.globalAlpha = 1
    },
    glyph(c0, r0, ink, ch) {
      const c = Math.round(c0)
      const r = Math.round(r0)
      if (!inside(c, r)) return
      ctx.fillStyle = ink
      if (glyphs) ctx.fillText(ch, c * cell + cell / 2, r * cell + cell / 2 + 0.5)
      else ctx.fillRect(c * cell + cell * 0.3, r * cell + cell * 0.3, cell * 0.4, cell * 0.4)
    },
    rows,
    sky(stops) {
      const gradient = ctx.createLinearGradient(0, 0, 0, rows * cell)
      for (const [at, colour] of stops) gradient.addColorStop(Math.min(1, Math.max(0, at)), colour)
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, w, h)
    },
    t,
    tile(c0, r0, fill, ink, glyph) {
      const c = Math.round(c0)
      const r = Math.round(r0)
      if (!inside(c, r)) return
      ctx.fillStyle = fill
      ctx.fillRect(c * cell + gap / 2, r * cell + gap / 2, cell - gap, cell - gap)
      if (!glyphs) return
      ctx.fillStyle = ink
      ctx.fillText(glyph, c * cell + cell / 2, r * cell + cell / 2 + 0.5)
    },
  }
}

/** A scene playing on a canvas that fills its box; still when motion is reduced. */
export function WallpaperCanvas({
  cell = 16,
  className,
  name,
}: {
  name: Wallpaper
  /** CSS pixels a cell. */
  cell?: number
  className?: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || name === 'None') return
    const scene = SCENES[name]
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let w = 0
    let h = 0
    let frame = 0
    let last = -Infinity
    // Started well in, so seeds and clouds are already out on the first frame.
    const draw = (now: number) => {
      if (w > 0 && h > 0) scene(painter(ctx, w, h, cell, 60 + now / 1000))
    }
    const fit = () => {
      const box = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      w = box.width
      h = box.height
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      draw(performance.now())
    }
    const observer = new ResizeObserver(fit)
    observer.observe(canvas)
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop)
      if (now - last < 1000 / FPS - 2) return
      last = now
      draw(now)
    }
    if (!still) frame = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [name, cell])
  return <canvas ref={ref} aria-hidden className={cn('block', className)} />
}

/**
 * Behind the whole window: the scene, under every surface. The panes around the chat
 * (sidebar, bars, panels, pages) sit on it as glass (`.glass`, while `data-wallpaper` is set).
 */
export function AppWallpaper() {
  const name = useWallpaper()
  useEffect(() => {
    const root = document.documentElement
    if (name === 'None') delete root.dataset.wallpaper
    else root.dataset.wallpaper = name
    return () => {
      delete root.dataset.wallpaper
    }
  }, [name])
  if (name === 'None') return null
  return (
    <WallpaperCanvas
      key={name}
      name={name}
      className="animate-in fade-in pointer-events-none fixed inset-0 -z-10 size-full duration-300 ease-out"
    />
  )
}

/** Over the scene, behind a chat: a light veil where its text runs, so it stays easy to read. */
export function ChatVeil({ name }: { name: Wallpaper }) {
  if (name === 'None') return null
  return <div aria-hidden className="wallpaper-veil pointer-events-none absolute inset-0 -z-10" />
}

// The picked background: read from Settings once, then kept in step with it.

let chosen: Wallpaper = DEFAULT_WALLPAPER
let loaded = false
const listeners = new Set<() => void>()

function set(next: Wallpaper) {
  chosen = next
  for (const l of listeners) l()
}

/** The background from stored settings: a missing or unknown name is None. */
export const wallpaperFrom = (settings: Record<string, unknown>): Wallpaper => {
  const v = settings[WALLPAPER_SETTING]
  return isWallpaper(v) ? v : DEFAULT_WALLPAPER
}

/** A background written (or reset, `null`) in Settings: open chats follow at once. */
export function noteWallpaperSetting(id: string, value: unknown) {
  if (id === WALLPAPER_SETTING) set(isWallpaper(value) ? value : DEFAULT_WALLPAPER)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!loaded) {
    loaded = true
    invoke<{ settings: Record<string, unknown> }>('read_settings')
      .then((read) => set(wallpaperFrom(read.settings)))
      .catch(() => {
        // Unreadable settings: the plain chat.
      })
  }
  return () => listeners.delete(listener)
}

export const useWallpaper = () => useSyncExternalStore(subscribe, () => chosen)
