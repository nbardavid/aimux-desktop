import { describe, expect, test } from 'bun:test'

import { wallpaperFrom } from './wallpaper'
import { flicker, hash, type Paint, SCENES, WALLPAPER_SETTING } from './wallpapers'

/** A Paint that records what a scene draws, by kind. */
function recorder(cols: number, rows: number, t: number) {
  const drawn = { field: 0, glyph: 0, sky: 0, tile: 0 }
  const paint: Paint = {
    cols,
    field: (_, level) => {
      drawn.field++
      expect(Number.isFinite(level(0, 0))).toBe(true)
    },
    glyph: (c, r, ink, ch) => {
      drawn.glyph++
      expect(Number.isFinite(c) && Number.isFinite(r)).toBe(true)
      expect(ink.length > 0 && ch.length > 0).toBe(true)
    },
    rows,
    sky: () => drawn.sky++,
    t,
    tile: (c, r, fill, ink, glyph) => {
      drawn.tile++
      expect(Number.isFinite(c) && Number.isFinite(r)).toBe(true)
      expect(fill.length > 0 && ink.length > 0 && glyph.length > 0).toBe(true)
    },
  }
  return { drawn, paint }
}

describe('scenes', () => {
  for (const [name, scene] of Object.entries(SCENES))
    test(`${name} draws a full frame at any size`, () => {
      for (const [cols, rows] of [
        [1, 1],
        [20, 12],
        [90, 56],
      ] as const)
        for (const t of [0, 61.3, 5000]) {
          const { drawn, paint } = recorder(cols, rows, t)
          scene(paint)
          expect(drawn.sky).toBe(1)
          if (cols >= 20) expect(drawn.tile).toBeGreaterThan(0)
        }
    })
})

test('hash is stable and in [0, 1)', () => {
  expect(hash(3, 4, 5)).toBe(hash(3, 4, 5))
  for (let i = -50; i < 50; i++) {
    const v = hash(i, i * 7)
    expect(v >= 0 && v < 1).toBe(true)
  }
})

test('a glyph holds still between beats', () => {
  const set = 'abcdef'
  expect(set).toContain(flicker(set, 1, 2, 10))
  expect(flicker(set, 1, 2, 10)).toBe(flicker(set, 1, 2, 10.01))
})

test('the background setting falls back to None', () => {
  expect(wallpaperFrom({})).toBe('None')
  expect(wallpaperFrom({ [WALLPAPER_SETTING]: 'Nope' })).toBe('None')
  expect(wallpaperFrom({ [WALLPAPER_SETTING]: 'Koi' })).toBe('Koi')
  // Scenes that were dropped: whoever had one picked gets the plain chat back.
  expect(wallpaperFrom({ [WALLPAPER_SETTING]: 'Tide' })).toBe('None')
  expect(wallpaperFrom({ [WALLPAPER_SETTING]: 'Meadow' })).toBe('None')
})
