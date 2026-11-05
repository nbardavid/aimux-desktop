import { useCallback, useEffect, useState } from 'react'

export interface Layout {
  sideOpen: boolean
  gitOpen: boolean
  sideWidth: number
  gitWidth: number
}

const KEY = 'aimux.layout'
const DEFAULTS: Layout = { gitOpen: true, gitWidth: 280, sideOpen: true, sideWidth: 232 }
export const LIMITS = { git: [220, 520], side: [180, 420] } as const

function load(): Layout {
  // A per-window convenience: storage may be empty or refused, the defaults then hold.
  try {
    const raw = localStorage.getItem(KEY)
    return raw === null ? DEFAULTS : { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Layout>) }
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
