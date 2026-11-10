import { type PointerEvent as ReactPointerEvent, useCallback, useRef, useState } from 'react'

/** How far the pointer goes before a press becomes a drag (px), so a click stays a click. */
const SLOP = 4

/**
 * Where `id` lands among `others` (their midlines, top to bottom) for a pointer at `y`:
 * past every row whose middle it crossed.
 */
export function dropIndex(y: number, others: readonly { top: number; height: number }[]): number {
  return others.filter((r) => r.top + r.height / 2 < y).length
}

/**
 * Drag-to-reorder for a vertical list: rows carry `data-reorder-id` under one
 * `data-reorder` parent (a `data-reorder-measure` inside a row is what is measured, e.g. a
 * project's header over its whole group). The list moves live under the pointer; the
 * drop commits the order, and the click that follows a drag is swallowed.
 */
export function useReorder(commit: (ids: string[]) => void) {
  const [drag, setDrag] = useState<{ id: string; order: string[] } | null>(null)
  const swallow = useRef(false)

  const start = useCallback(
    (id: string, ids: readonly string[], e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0 || ids.length < 2) return
      // A field (a rename in place) keeps its own pointer: selecting text isn't a drag.
      if ((e.target as HTMLElement).closest('input, textarea') !== null) return
      const list = e.currentTarget.closest<HTMLElement>('[data-reorder]')
      if (list === null) return
      const startY = e.clientY
      let order = [...ids]
      let live = false
      const move = (ev: PointerEvent) => {
        if (!live && Math.abs(ev.clientY - startY) < SLOP) return
        live = true
        document.body.style.cursor = 'grabbing'
        const others = [...list.querySelectorAll<HTMLElement>(':scope > [data-reorder-id]')]
          .filter((row) => row.dataset.reorderId !== id)
          .map((row) =>
            (row.querySelector('[data-reorder-measure]') ?? row).getBoundingClientRect()
          )
        const rest = order.filter((x) => x !== id)
        const at = dropIndex(ev.clientY, others)
        const next = [...rest.slice(0, at), id, ...rest.slice(at)]
        order = next
        setDrag((d) => (d?.order.join() === next.join() ? d : { id, order: next }))
      }
      const end = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', end)
        window.removeEventListener('pointercancel', end)
        document.body.style.cursor = ''
        setDrag(null)
        if (!live) return
        swallow.current = true
        setTimeout(() => (swallow.current = false))
        if (order.join() !== ids.join()) commit(order)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', end)
      window.addEventListener('pointercancel', end)
    },
    [commit]
  )

  /** `list` in the order being dragged, when the drag is in it. */
  const arranged = <T extends { id: string }>(list: readonly T[]): readonly T[] => {
    if (drag === null || !list.some((x) => x.id === drag.id)) return list
    return drag.order.flatMap((id) => list.filter((x) => x.id === id))
  }

  /** On the list: the click a drop ends with doesn't select or fold anything. */
  const onClickCapture = (e: { preventDefault(): void; stopPropagation(): void }) => {
    if (!swallow.current) return
    e.preventDefault()
    e.stopPropagation()
  }

  return { arranged, dragging: drag?.id ?? null, onClickCapture, start }
}
