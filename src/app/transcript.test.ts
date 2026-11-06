import { expect, test } from 'bun:test'

import { pinnedAfterScroll, stickToBottom } from './transcript'

test('a pinned column goes back to its bottom on any resize; an unpinned one stays put', () => {
  let fire = () => {}
  const watched: unknown[] = []
  let disconnected = false
  class FakeObserver {
    constructor(callback: () => void) {
      fire = callback
    }
    observe(target: unknown) {
      watched.push(target)
    }
    disconnect() {
      disconnected = true
    }
  }
  const scroller = { scrollHeight: 900, scrollTop: 300 } as unknown as HTMLDivElement
  const content = {} as Element
  let pinned = true
  const stop = stickToBottom(
    scroller,
    content,
    () => pinned,
    FakeObserver as unknown as typeof ResizeObserver
  )
  expect(watched).toEqual([scroller, content])
  fire()
  expect(scroller.scrollTop).toBe(900)
  pinned = false
  scroller.scrollTop = 100
  fire()
  expect(scroller.scrollTop).toBe(100)
  stop()
  expect(disconnected).toBe(true)
})

test('a scroll that comes with a resize keeps the column pinned; the reader’s own scroll decides', () => {
  const before = { clientHeight: 516, scrollHeight: 1138 }
  // The window got shorter: the column is 243px off its bottom, but the reader did nothing.
  const resized = { clientHeight: 216, scrollHeight: 1208, scrollTop: 748.5 }
  expect(pinnedAfterScroll(true, before, resized)).toBe(true)
  expect(pinnedAfterScroll(false, before, resized)).toBe(false)
  // Same size: the reader scrolled up, or back down to the bottom.
  expect(pinnedAfterScroll(true, before, { ...before, scrollTop: 300 })).toBe(false)
  expect(pinnedAfterScroll(false, before, { ...before, scrollTop: 600 })).toBe(true)
})
