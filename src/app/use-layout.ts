import { useCallback, useEffect, useState } from 'react'

export interface Layout {
  sideOpen: boolean
  gitOpen: boolean
  /** Null until the sidebar is dragged: it then follows the window (`SIDE_WIDTH`). */
  sideWidth: number | null
  /** Null until the panel is dragged: it then follows the window (`GIT_WIDTH`). */
  gitWidth: number | null
  /** The panel's width while it shows a page; null follows the window (`BROWSER_WIDTH`). */
  browserWidth: number | null
}

const KEY = 'logit.layout'
const DEFAULTS: Layout = {
  browserWidth: null,
  gitOpen: true,
  gitWidth: null,
  sideOpen: true,
  sideWidth: null,
}
export const LIMITS = { browser: [360, 1200], git: [220, 520], side: [220, 420] } as const
/** The panels' widths until dragged: a share of the window, within reason. */
export const SIDE_WIDTH = 'clamp(220px, 18vw, 260px)'
export const GIT_WIDTH = 'clamp(280px, 24vw, 420px)'
/** A page needs room: about half the window. */
export const BROWSER_WIDTH = 'clamp(420px, 45vw, 1100px)'
const between = (min: number, share: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(window.innerWidth * share)))
/** The same in pixels, for the splitters to say. */
export const sideWidthNow = () => between(220, 0.18, 260)
export const gitWidthNow = () => between(280, 0.24, 420)
export const browserWidthNow = () => between(420, 0.45, 1100)
/** What earlier versions saved as the default widths: a width equal to one was never dragged. */
const OLD_GIT_DEFAULT = 280
const OLD_SIDE_DEFAULTS = new Set([232, 260])

function load(): Layout {
  // A per-window convenience: storage may be empty or refused, the defaults then hold.
  try {
    const raw = localStorage.getItem(KEY)
    const stored =
      raw === null ? DEFAULTS : { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Layout>) }
    // Limits move between versions: a width saved under older ones is brought back inside.
    const clamp = (v: number, [min, max]: readonly [number, number]) =>
      Math.min(max, Math.max(min, v))
    return {
      ...stored,
      browserWidth:
        stored.browserWidth === null ? null : clamp(stored.browserWidth, LIMITS.browser),
      gitWidth:
        stored.gitWidth === null || stored.gitWidth === OLD_GIT_DEFAULT
          ? null
          : clamp(stored.gitWidth, LIMITS.git),
      sideWidth:
        stored.sideWidth === null || OLD_SIDE_DEFAULTS.has(stored.sideWidth)
          ? null
          : clamp(stored.sideWidth, LIMITS.side),
    }
  } catch {
    return DEFAULTS
  }
}

/** Panel sizes and visibility, remembered across launches. */
export function useLayout() {
  const [layout, setLayout] = useState(load)
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(layout))
    } catch {
      // nothing to do: the next launch starts from the defaults
    }
  }, [layout])
  const update = useCallback((patch: Partial<Layout>) => setLayout((l) => ({ ...l, ...patch })), [])
  return { layout, update }
}
