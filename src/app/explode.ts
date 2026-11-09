/**
 * The goodbye of a deleted workspace: a copy of its sidebar row trembles harder and harder to
 * the left, then breaks into small square pieces of itself that fly across the whole window and
 * fall away. Purely visual; the row itself has already left the list.
 */
import { useCallback, useState } from 'react'

const SHAKE_MS = 380
const JOLTS = 14
const BURST_MS = 1300
/** A piece's side, in px: small enough to read as crumbs of the row. */
const PIECE = 4
const FRAMES = 12

const still = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Workspaces being deleted in the background, hidden from the sidebar meanwhile. */
export function useLeaving() {
  const [ids, setIds] = useState<ReadonlySet<string>>(new Set())
  const mark = useCallback((id: string, on: boolean) => {
    setIds((s) => {
      const next = new Set(s)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])
  return [ids, mark] as const
}

export const withoutLeaving = <C extends { workspaces: { id: string }[] }>(
  catalog: C,
  leaving: ReadonlySet<string>
): C =>
  leaving.size === 0
    ? catalog
    : { ...catalog, workspaces: catalog.workspaces.filter((w) => !leaving.has(w.id)) }

/** The row's place and look, taken before the list loses it. */
export const captureRow = (workspaceId: string) => {
  const row = document.querySelector<HTMLElement>(`[data-workspace="${CSS.escape(workspaceId)}"]`)
  if (row === null) return null
  return { clone: row.cloneNode(true) as HTMLElement, rect: row.getBoundingClientRect(), row }
}

/** The row's content and its hover tools (the "…" beside it): all but its background. */
const hideable = (row: HTMLElement) =>
  [
    ...row.children,
    ...(row.parentElement?.querySelectorAll('button[aria-label^="More for"]') ?? []),
  ] as HTMLElement[]

/** Where the row has something drawn (text, icons), relative to it: the pieces worth flying. */
const inkOf = (row: HTMLElement, rect: DOMRect) => {
  const boxes: DOMRect[] = []
  const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  const range = document.createRange()
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    let found: DOMRect[] = []
    if (node instanceof SVGSVGElement) found = [node.getBoundingClientRect()]
    else if (node instanceof Text && node.textContent?.trim()) {
      range.selectNodeContents(node)
      found = [...range.getClientRects()]
    }
    for (const b of found) boxes.push(new DOMRect(b.x - rect.x, b.y - rect.y, b.width, b.height))
  }
  return boxes
}

const overlaps = (b: DOMRect, left: number, top: number) =>
  left < b.right && left + PIECE > b.left && top < b.bottom && top + PIECE > b.top

/** A copy of the row pinned where it stood, above everything, deaf to the pointer. */
const pinned = (clone: HTMLElement, rect: DOMRect) => {
  const el = clone.cloneNode(true) as HTMLElement
  Object.assign(el.style, {
    height: `${rect.height}px`,
    left: `${rect.left}px`,
    margin: '0',
    pointerEvents: 'none',
    position: 'fixed',
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    zIndex: '9999',
  })
  // Only the content leaves: the row's own background stays in the list.
  el.style.background = 'transparent'
  el.style.boxShadow = 'none'
  el.style.outline = 'none'
  return el
}

/** Jolts that grow, each one pulling further left than it springs back. */
const trembling = (): Keyframe[] =>
  Array.from({ length: JOLTS + 1 }, (_, i) => {
    const p = i / JOLTS
    const amp = 1.5 + p * 9
    const x = i % 2 === 0 ? -amp : amp * 0.35
    const y = (Math.random() - 0.5) * p * 3
    const turn = (Math.random() - 0.5) * p * 3
    return { transform: `translate(${x}px, ${y}px) rotate(${turn}deg) scale(${1 + p * 0.03})` }
  })

/**
 * Plays the goodbye over the row, whose content goes invisible while its background stays put.
 * Resolves as the pieces take off, for the list to drop the row while they fly.
 */
const explode = async (shot: ReturnType<typeof captureRow>) =>
  new Promise<void>((done) => {
    if (shot === null || still()) return done()
    const { clone, rect } = shot
    const ink = inkOf(shot.row, rect)
    for (const el of hideable(shot.row)) el.style.visibility = 'hidden'
    const row = pinned(clone, rect)
    document.body.append(row)
    const shake = row.animate(trembling(), {
      duration: SHAKE_MS,
      easing: 'linear',
      fill: 'forwards',
    })
    shake.onfinish = () => {
      burst(clone, rect, ink)
      row.remove()
      done()
    }
  })

/** Pieces of the row, each with its own flight across the window under gravity. */
const burst = (clone: HTMLElement, rect: DOMRect, ink: DOMRect[]) => {
  const reach = Math.hypot(window.innerWidth, window.innerHeight) * 0.75
  const seconds = BURST_MS / 1000
  const pieces: HTMLElement[] = []
  for (let top = 0; top < rect.height; top += PIECE)
    for (let left = 0; left < rect.width; left += PIECE) {
      if (!ink.some((b) => overlaps(b, left, top))) continue
      // A box the piece's size showing its bit of the row: small layers, cheap to move.
      const piece = document.createElement('div')
      Object.assign(piece.style, {
        contain: 'strict',
        height: `${PIECE}px`,
        left: `${rect.left + left}px`,
        overflow: 'hidden',
        pointerEvents: 'none',
        position: 'fixed',
        top: `${rect.top + top}px`,
        width: `${PIECE}px`,
        willChange: 'transform, opacity',
        zIndex: '9999',
      })
      const inner = pinned(clone, rect)
      Object.assign(inner.style, { left: `${-left}px`, position: 'absolute', top: `${-top}px` })
      piece.append(inner)
      pieces.push(piece)

      const angle = Math.random() * Math.PI * 2
      const speed = (0.25 + Math.random() * 0.75) * reach
      const vx = Math.cos(angle) * speed + reach * 0.15
      const vy = Math.sin(angle) * speed - reach * 0.3
      const spin = (Math.random() - 0.5) * 1440
      const frames: Keyframe[] = Array.from({ length: FRAMES + 1 }, (_, i) => {
        const p = i / FRAMES
        const t = p * seconds
        const drag = (1 - Math.exp(-2.4 * t)) / 2.4
        const x = vx * drag
        const y = vy * drag + 550 * t * t
        return {
          opacity: 1 - p * p,
          transform: `translate(${x}px, ${y}px) rotate(${spin * t}deg) scale(${1 - p * 0.4})`,
        }
      })
      piece.animate(frames, {
        duration: BURST_MS * (0.75 + Math.random() * 0.25),
        fill: 'forwards',
      })
    }
  document.body.append(...pieces)
  setTimeout(() => {
    for (const piece of pieces) piece.remove()
  }, BURST_MS + 50)
}

/**
 * Bursts a workspace's row, then deletes it: the row keeps its place and background until the
 * row bursts, and stays hidden while git removes the worktree. A refusal brings it back
 * and throws.
 */
export const leaveInPieces = async (
  id: string,
  remove: () => Promise<void>,
  mark: (id: string, leaving: boolean) => void
) => {
  const shot = captureRow(id)
  await explode(shot)
  mark(id, true)
  try {
    await remove()
  } finally {
    if (shot) for (const el of hideable(shot.row)) el.style.visibility = ''
    mark(id, false)
  }
}
