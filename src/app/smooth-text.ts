// Claude's text arrives in bursts: shown as it lands it jumps a line at a time. This reveals it
// at a steady pace instead, fast enough to never fall behind: each frame shows a share of what
// is still hidden, so a big burst catches up within ~CATCH_UP_MS and a trickle reads evenly.
import { useEffect, useRef, useState } from 'react'

const CATCH_UP_MS = 260
/** At least this many characters a second, so the end of an answer never crawls. */
const MIN_RATE = 300

/** How many characters to show after `dt` ms, from `shown` toward `target`. */
export function nextShown(shown: number, target: number, dt: number): number {
  if (shown >= target) return target
  const backlog = target - shown
  const step = Math.max(backlog * Math.min(1, dt / CATCH_UP_MS), (MIN_RATE * dt) / 1000)
  return Math.min(target, shown + Math.max(1, Math.round(step)))
}

/** `text` revealed smoothly while `live`; whole at once otherwise (a replay, a finished answer). */
export function useSmoothText(text: string, live: boolean): string {
  // What is already there on mount (a tab switched back to) shows at once; only what comes next
  // is revealed.
  const [shown, setShown] = useState(text.length)
  const target = useRef(text.length)
  target.current = text.length
  const reduced =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const smooth = live && !reduced
  useEffect(() => {
    if (!smooth) return
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = now - last
      last = now
      setShown((s) => nextShown(s, target.current, dt))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [smooth])
  return smooth ? text.slice(0, Math.min(shown, text.length)) : text
}
