import type { TerminalSpan } from '@brimveyn/aimux-config'

const CUBE_LEVELS = [0, 95, 135, 175, 215, 255]

const hex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`

/** The xterm 256-color palette: 16 theme colors, the 6×6×6 cube, then 24 grays. */
export function xterm256Palette(base16: readonly string[]): string[] {
  const palette = base16.slice(0, 16)
  for (let i = 0; i < 216; i++) {
    const level = (n: number) => CUBE_LEVELS[n] ?? 0
    palette.push(hex(level(Math.floor(i / 36)), level(Math.floor(i / 6) % 6), level(i % 6)))
  }
  for (let i = 0; i < 24; i++) {
    const v = 8 + 10 * i
    palette.push(hex(v, v, v))
  }
  return palette
}

/** `undefined` = the theme's default color. */
export function spanColor(
  span: TerminalSpan,
  which: 'fg' | 'bg',
  palette: readonly string[]
): string | undefined {
  const index = which === 'fg' ? span.fgPalette : span.bgPalette
  if (index !== undefined) return palette[index]
  return which === 'fg' ? span.fg : span.bg
}
