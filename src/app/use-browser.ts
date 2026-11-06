// Keeps a page's native webview exactly over its placeholder, and out of sight whenever it
// shouldn't be seen: another view, the panel moving, or a menu, dialog or tooltip over it.
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useEffect, useRef, useState } from 'react'

import { browserId, isBrowser, type PanelView } from './browser-tabs'
import { nativePages } from './browser-view'

interface Box {
  top: number
  right: number
  bottom: number
  left: number
}

/** Whether the native page should be on screen. */
export function browserShown(s: {
  mode: 'normal' | 'git' | 'settings'
  panelOpen: boolean
  view: PanelView
  covered: boolean
  sliding: boolean
}): boolean {
  return s.mode === 'normal' && s.panelOpen && isBrowser(s.view) && !s.covered && !s.sliding
}

/** Whether any of `boxes` crosses `page` (touching edges don't; an empty box never does). */
export function covers(boxes: readonly Box[], page: Box): boolean {
  return boxes.some(
    (b) =>
      b.right > b.left &&
      b.bottom > b.top &&
      b.left < page.right &&
      b.right > page.left &&
      b.top < page.bottom &&
      b.bottom > page.top
  )
}

/**
 * A queue for page commands: each runs once the one before it settled, so a hide never
 * overtakes a show. A job cancelled before its turn is skipped.
 */
export function serial() {
  let tail: Promise<void> = Promise.resolve()
  return (job: () => Promise<unknown>) => {
    let alive = true
    const done = tail.then(async () => {
      if (alive) await job()
    })
    tail = done.catch(() => {})
    return { cancel: () => (alive = false), done: tail }
  }
}

/** The boxes of what floats in body's portals (menus, dialogs, tooltips), two levels deep. */
function floating(): Box[] {
  const root = document.querySelector('#root')
  return [...document.body.children]
    .filter((el) => el !== root && el.tagName !== 'SCRIPT')
    .flatMap((el) => [el, ...el.querySelectorAll(':scope > *, :scope > * > *')])
    .map((el) => el.getBoundingClientRect())
}

/**
 * True while something floating crosses `target`: watched from body's portal children, and
 * re-measured every frame while any is there (popups position themselves after they mount).
 */
export function useCovered(target: HTMLElement | null): boolean {
  const [covered, setCovered] = useState(false)
  useEffect(() => {
    let frame = 0
    const measure = () => {
      const box = target?.getBoundingClientRect()
      const boxes = floating()
      setCovered(box !== undefined && covers(boxes, box))
      frame = boxes.length > 0 ? requestAnimationFrame(measure) : 0
    }
    const observer = new MutationObserver(() => {
      if (frame === 0) frame = requestAnimationFrame(measure)
    })
    observer.observe(document.body, { childList: true })
    measure()
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [target])
  return covered
}

const boundsOf = (el: HTMLElement) => {
  const r = el.getBoundingClientRect()
  return { height: r.height, width: r.width, x: r.left, y: r.top }
}

/** Every page command goes through one queue: a hide never overtakes a show. */
const queue = serial()
const hideAll = () => queue(async () => invoke('browser_hide_all'))

/**
 * Shows `url`'s page over `placeholder` while `shown`, follows its size, and hides every page
 * otherwise. Never gives the page the keyboard. Returns whether the page has loaded once.
 */
export function useBrowser(
  url: string | undefined,
  placeholder: HTMLElement | null,
  shown: boolean
): boolean {
  const [loaded, setLoaded] = useState<ReadonlySet<string>>(new Set())
  useEffect(() => {
    if (!nativePages) return
    const unlisten = listen<{ id: string }>('browser-loaded', ({ payload }) =>
      setLoaded((s) => new Set(s).add(payload.id))
    )
    return () => void unlisten.then((f) => f())
  }, [])

  const id = url === undefined ? undefined : browserId(url)
  useEffect(() => {
    if (!nativePages) return
    const el = placeholder
    if (!shown || url === undefined || id === undefined || el === null) {
      hideAll()
      return
    }
    // One page at a time: the others go first. Cancelled if this stops being wanted first.
    const show = queue(async () => {
      await invoke('browser_hide_all')
      await invoke('browser_show', { bounds: boundsOf(el), id, url })
    })
    let frame = 0
    const follow = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        void invoke('browser_bounds', { bounds: boundsOf(el), id }).catch(() => {})
      })
    }
    const resize = new ResizeObserver(follow)
    resize.observe(el)
    window.addEventListener('resize', follow)
    return () => {
      show.cancel()
      resize.disconnect()
      window.removeEventListener('resize', follow)
      cancelAnimationFrame(frame)
    }
  }, [shown, url, id, placeholder])

  // Leaving the screen (settings, git mode, no workspace): nothing native stays behind.
  useEffect(() => () => void hideAll(), [])

  return id !== undefined && loaded.has(id)
}

/** Reloads a page if it is alive (a republished artifact). */
export const reloadPage = (url: string) =>
  queue(async () => invoke('browser_reload', { id: browserId(url) }))

/** A page's title as WebKit reads it, for tabs Claude gave none. */
export function usePageTitles(onTitle: (id: string, title: string) => void) {
  const latest = useRef(onTitle)
  latest.current = onTitle
  useEffect(() => {
    if (!nativePages) return
    const unlisten = listen<{ id: string; title: string }>('browser-title', ({ payload }) =>
      latest.current(payload.id, payload.title)
    )
    return () => void unlisten.then((f) => f())
  }, [])
}
