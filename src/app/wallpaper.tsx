import { invoke } from '@tauri-apps/api/core'
import { useEffect, useRef, useSyncExternalStore } from 'react'

import { cn } from '@/lib/utils'

import {
  DEFAULT_WALLPAPER,
  isWallpaper,
  type Paint,
  type SceneName,
  SCENES,
  type Wallpaper,
  WALLPAPER_BLUR_SETTING,
  WALLPAPER_IMAGE_SETTING,
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
  name: SceneName
  /** CSS pixels a cell. */
  cell?: number
  className?: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
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
  const { blur, image, name } = useWallpaperState()
  // Image without a picture yet is the plain chat.
  const shown = name === 'Image' && !image ? 'None' : name
  useEffect(() => {
    const root = document.documentElement
    if (shown === 'None') delete root.dataset.wallpaper
    else root.dataset.wallpaper = shown
    return () => {
      delete root.dataset.wallpaper
    }
  }, [shown])
  // A blurred background is blurred once: the glass over it stops adding its own.
  useEffect(() => {
    const root = document.documentElement
    if (blur > 0) root.dataset.wallpaperBlur = ''
    else delete root.dataset.wallpaperBlur
    return () => {
      delete root.dataset.wallpaperBlur
    }
  }, [blur])
  if (shown === 'None') return null
  // A blur pulls the edges in: the layer overflows the window by twice the radius.
  const style = blur > 0 ? { filter: `blur(${blur}px)`, inset: -blur * 2 } : undefined
  const layer = 'animate-in fade-in pointer-events-none fixed inset-0 -z-10 duration-300 ease-out'
  return (
    <div aria-hidden style={style} className={layer}>
      {shown === 'Image' ? (
        <img src={image} alt="" draggable={false} className="size-full object-cover" />
      ) : (
        <WallpaperCanvas key={shown} name={shown} className="size-full" />
      )}
    </div>
  )
}

/** Over the scene, behind a chat: a light veil where its text runs, so it stays easy to read. */
export function ChatVeil({ name }: { name: Wallpaper }) {
  if (name === 'None') return null
  return <div aria-hidden className="wallpaper-veil pointer-events-none absolute inset-0 -z-10" />
}

// The picked background, its picture and its blur: read from Settings once, then kept in
// step with it.

interface WallpaperState {
  name: Wallpaper
  image: string
  blur: number
}

let state: WallpaperState = { blur: 0, image: '', name: DEFAULT_WALLPAPER }
let loaded = false
const listeners = new Set<() => void>()

function set(patch: Partial<WallpaperState>) {
  state = { ...state, ...patch }
  for (const l of listeners) l()
}

/** The background from stored settings: a missing or unknown name is None. */
export const wallpaperFrom = (settings: Record<string, unknown>): Wallpaper => {
  const v = settings[WALLPAPER_SETTING]
  return isWallpaper(v) ? v : DEFAULT_WALLPAPER
}

const imageFrom = (v: unknown) => (typeof v === 'string' && v.startsWith('data:image/') ? v : '')
const blurFrom = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(40, Math.max(0, v)) : 0

/** A background setting written (or reset, `null`) in Settings: the window follows at once. */
export function noteWallpaperSetting(id: string, value: unknown) {
  if (id === WALLPAPER_SETTING) set({ name: isWallpaper(value) ? value : DEFAULT_WALLPAPER })
  if (id === WALLPAPER_IMAGE_SETTING) set({ image: imageFrom(value) })
  if (id === WALLPAPER_BLUR_SETTING) set({ blur: blurFrom(value) })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!loaded) {
    loaded = true
    invoke<{ settings: Record<string, unknown> }>('read_settings')
      .then((read) =>
        set({
          blur: blurFrom(read.settings[WALLPAPER_BLUR_SETTING]),
          image: imageFrom(read.settings[WALLPAPER_IMAGE_SETTING]),
          name: wallpaperFrom(read.settings),
        })
      )
      .catch(() => {
        // Unreadable settings: the plain chat.
      })
  }
  return () => listeners.delete(listener)
}

export const useWallpaperState = () => useSyncExternalStore(subscribe, () => state)
export const useWallpaper = () => useSyncExternalStore(subscribe, () => state.name)

/** A picked picture as a JPEG data URL, at most 2400 px on its long side. */
export async function pictureUrl(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', 0.85)
}
