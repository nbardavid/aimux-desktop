// The sidebar while it is hidden (⌘S): the pointer at the window's left edge slides it out over
// the content, which never moves; it slides back once the pointer leaves it.
import { type ReactNode, useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

/** How long the pointer may be away before it slides back: crossing a gap does not shut it. */
const LEAVE_MS = 280

export function SidePeek({ children, width }: { width: string; children: ReactNode }) {
  const [out, setOut] = useState(false)
  const timer = useRef(0)
  const stay = () => {
    window.clearTimeout(timer.current)
    setOut(true)
  }
  const leave = () => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setOut(false), LEAVE_MS)
  }
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return (
    <>
      {/* The edge that calls it: below the traffic lights' row, the window's whole height. */}
      <div
        aria-hidden
        className="fixed top-10 bottom-0 left-0 z-40 w-2"
        onMouseEnter={stay}
        onMouseLeave={leave}
      />
      <div
        className={cn(
          'bg-side fixed top-0 bottom-0 left-0 z-50 flex border-r transition-[translate,box-shadow] duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none',
          out
            ? 'translate-x-0 shadow-[2px_0_12px_rgb(43_40_38/0.06)]'
            : '-translate-x-full shadow-none'
        )}
        style={{ width }}
        inert={!out}
        onMouseEnter={stay}
        onMouseLeave={leave}
      >
        {children}
      </div>
    </>
  )
}
