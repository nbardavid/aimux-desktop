// A long chat is built from its end: the last exchanges first, older ones a page at a time as
// the reader scrolls up to them. What is on screen never moves when a page comes in above it.
import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react'

/** Exchanges built at once, and added per page. */
export const PAGE = 20

/**
 * The first exchange shown. `start` is fixed once the chat has exchanges (null before): new
 * exchanges extend the window at the end, never push the top out from under the reader.
 */
export function firstShown(start: number | null, count: number): number {
  return Math.min(start ?? Math.max(0, count - PAGE), count)
}

/** The page before `first`: where the window starts once it comes in. */
export const earlier = (first: number) => Math.max(0, first - PAGE)

/**
 * Which exchanges to build, of `count`: from the returned index to the end. `sentinel` goes
 * above the first one; as it nears the screen, the page before it comes in, and the scroller
 * keeps what was on screen where it was (WebKit has no scroll anchoring of its own).
 */
export function useWindow(scroller: RefObject<HTMLElement | null>, count: number) {
  const [start, setStart] = useState<number | null>(null)
  const first = firstShown(start, count)
  const sentinel = useRef<HTMLDivElement>(null)
  const before = useRef<number | null>(null)

  useLayoutEffect(() => {
    if (start === null && count > 0) setStart(Math.max(0, count - PAGE))
  }, [start, count])

  useEffect(() => {
    const root = scroller.current
    const mark = sentinel.current
    if (!root || !mark || first === 0) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting !== true) return
        before.current = root.scrollHeight
        setStart(earlier(first))
      },
      { root, rootMargin: '800px 0px 0px 0px' }
    )
    observer.observe(mark)
    return () => observer.disconnect()
  }, [scroller, first])

  // The page came in above: the scroller moves down by its height, so nothing on screen moves.
  useLayoutEffect(() => {
    const root = scroller.current
    if (!root || before.current === null) return
    root.scrollTop += root.scrollHeight - before.current
    before.current = null
  }, [scroller, first])

  return { first, sentinel }
}
