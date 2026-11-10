import { type PointerEvent as ReactPointerEvent, useCallback, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

/** How far the pointer goes before a press becomes a drag (px), so a click stays a click. */
const SLOP = 4
/** Neighbours making room and the drop settling, as tabs do (DESIGN.md, Motion). */
const SLIDE = 'transform 160ms ease-out'
const SETTLE_MS = 160

/**
 * Where a dragged row lands among the others (their midlines, top to bottom) for a pointer
 * at `y`: past every row whose middle it crossed.
 */
export function dropIndex(y: number, others: readonly { top: number; height: number }[]): number {
  return others.filter((r) => r.top + r.height / 2 < y).length
}

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Drag-to-reorder for a vertical list: rows carry `data-reorder-id` under one
 * `data-reorder` parent (a `data-reorder-measure` inside a row is what the pointer is
 * matched against, e.g. a project's header over its whole group). The dragged row follows
 * the pointer, raised; the rows it passes slide aside; on the drop it settles into its slot
 * and the order is committed. The click a drag ends with is swallowed.
 */
export function useReorder(commit: (ids: string[]) => void) {
  const [dragging, setDragging] = useState<string | null>(null)
  const swallow = useRef(false)

  const start = useCallback(
    (id: string, ids: readonly string[], e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0 || ids.length < 2) return
      // A field (a rename in place) keeps its own pointer: selecting text isn't a drag.
      if ((e.target as HTMLElement).closest('input, textarea') !== null) return
      const list = e.currentTarget.closest<HTMLElement>('[data-reorder]')
      if (list === null) return
      const rows = [...list.querySelectorAll<HTMLElement>(':scope > [data-reorder-id]')]
      const from = rows.findIndex((row) => row.dataset.reorderId === id)
      const self = rows[from]
      if (self === undefined) return
      const startY = e.clientY
      let live = false
      let to = from
      // Measured once, before anything moves: the slots everything slides between.
      let boxes: DOMRect[] = []
      let hits: DOMRect[] = []

      const place = (row: HTMLElement, y: number, animate: boolean) => {
        row.style.transition = animate && !reduced() ? SLIDE : 'none'
        row.style.transform = y === 0 ? '' : `translateY(${y}px)`
      }
      /** Where the dragged row ends up when it lands at `at`, relative to where it was. */
      const box = (i: number) => boxes[i] ?? new DOMRect()
      const landing = (at: number) =>
        at > from ? box(at).bottom - box(from).bottom : box(at).top - box(from).top

      const move = (ev: PointerEvent) => {
        if (!live) {
          if (Math.abs(ev.clientY - startY) < SLOP) return
          live = true
          boxes = rows.map((row) => row.getBoundingClientRect())
          hits = rows.map((row) =>
            (row.querySelector('[data-reorder-measure]') ?? row).getBoundingClientRect()
          )
          document.body.style.cursor = 'grabbing'
          document.body.style.userSelect = 'none'
          self.style.position = 'relative'
          self.style.zIndex = '10'
          setDragging(id)
        }
        place(self, ev.clientY - startY, false)
        to = dropIndex(
          ev.clientY,
          hits.filter((_, i) => i !== from)
        )
        for (const [i, row] of rows.entries()) {
          if (i === from) continue
          const passed = (i > from && i <= to) || (i < from && i >= to)
          place(row, passed ? shiftFor(i) : 0, true)
        }
      }
      /** How far row `i` slides to make room: the dragged row's height and its gap. */
      const shiftFor = (i: number) => {
        if (i > from) return -(box(from + 1).top - box(from).top)
        return box(from).bottom - box(from - 1).bottom
      }

      const cleanUp = () => {
        for (const row of rows) {
          row.style.transition = 'none'
          row.style.transform = ''
          row.style.position = ''
          row.style.zIndex = ''
        }
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
      const end = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', end)
        window.removeEventListener('pointercancel', end)
        if (!live) return
        swallow.current = true
        setTimeout(() => (swallow.current = false))
        const order = [...ids]
        order.splice(to, 0, ...order.splice(from, 1))
        // Settle into the slot, then swap the DOM order under the same picture.
        place(self, to === from ? 0 : landing(to), true)
        setTimeout(
          () => {
            flushSync(() => {
              setDragging(null)
              if (to !== from) commit(order)
            })
            cleanUp()
          },
          reduced() ? 0 : SETTLE_MS
        )
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', end)
      window.addEventListener('pointercancel', end)
    },
    [commit]
  )

  /** On the list: the click a drop ends with doesn't select or fold anything. */
  const onClickCapture = (e: { preventDefault(): void; stopPropagation(): void }) => {
    if (!swallow.current) return
    e.preventDefault()
    e.stopPropagation()
  }

  return { dragging, onClickCapture, start }
}
