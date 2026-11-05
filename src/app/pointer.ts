let last = { x: Number.NaN, y: Number.NaN }

/**
 * Whether the pointer really moved. WebKit sends a mousemove (and mouseenter) when a list
 * scrolls under a still cursor, which would steal the keyboard's row while an arrow is held.
 */
export function pointerMoved(e: { clientX: number; clientY: number }): boolean {
  const moved = e.clientX !== last.x || e.clientY !== last.y
  last = { x: e.clientX, y: e.clientY }
  return moved
}
