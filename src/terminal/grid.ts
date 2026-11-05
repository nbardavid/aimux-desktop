export interface Size {
  width: number
  height: number
}

export function gridSize(px: Size, cell: Size): { cols: number; rows: number } {
  return {
    cols: Math.max(2, Math.floor(px.width / cell.width)),
    rows: Math.max(1, Math.floor(px.height / cell.height)),
  }
}

/** Measured in the DOM rather than on a canvas, so the width matches the spans exactly and the
 * height is the CSS line-height that `fontCss` (a `font` shorthand) sets. */
export function measureCell(fontCss: string): Size {
  const probe = document.createElement('span')
  probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre'
  probe.style.font = fontCss
  probe.textContent = 'M'.repeat(100)
  document.body.append(probe)
  const rect = probe.getBoundingClientRect()
  probe.remove()
  return { height: rect.height, width: rect.width / 100 }
}
