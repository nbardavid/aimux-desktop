import { describe, expect, test } from 'bun:test'

import { loadersFrom } from './loader-choice'
import {
  braille,
  DEFAULT_LOADERS,
  fitsSetting,
  frameAt,
  litDots,
  LOADER_NAMES,
  LOADERS,
  STATUS_LOADERS,
  stillFrame,
} from './loaders'

describe('braille', () => {
  test('lights the dots asked for, two columns per glyph', () => {
    expect(braille(2, [])).toBe('⠀')
    expect(braille(2, [[0, 0]])).toBe('⠁')
    expect(braille(2, [[3, 1]])).toBe('⢀')
    expect(
      braille(4, [
        [0, 0],
        [1, 2],
      ])
    ).toBe('⠁⠂')
    // Every dot of a glyph: the full cell.
    const all = [0, 1, 2, 3].flatMap(
      (r) =>
        [
          [r, 0],
          [r, 1],
        ] as const
    )
    expect(braille(2, all)).toBe('⣿')
  })
})

describe('loaders', () => {
  test('every frame of a loader is as wide as the others, and none is blank throughout', () => {
    for (const { frames } of Object.values(LOADERS)) {
      expect(new Set(frames.map((f) => f.length)).size).toBe(1)
      expect(frames.some((f) => /[^\u2800]/.test(f))).toBe(true)
    }
    expect(Object.keys(LOADERS)).toHaveLength(18)
    // Settings lists each one once.
    expect(new Set(LOADER_NAMES).size).toBe(18)
  })

  test('the orbit goes round one glyph, two dots at a time', () => {
    expect(LOADERS.orbit.frames).toEqual(['⠃', '⠉', '⠘', '⠰', '⢠', '⣀', '⡄', '⠆'])
  })

  test('loaders of a kind run in step, by the clock', () => {
    const { frames, interval } = LOADERS.helix
    expect(frameAt('helix', 0)).toBe(frames[0] as string)
    expect(frameAt('helix', interval * (frames.length + 1))).toBe(frames[1] as string)
  })
})

describe('status loaders', () => {
  test('litDots reads back the dots braille lit', () => {
    const lit = [
      [0, 0],
      [3, 1],
      [2, 3],
    ] as const
    expect(litDots(braille(4, lit))).toEqual([
      [0, 0],
      [3, 1],
      [2, 3],
    ])
    expect(litDots('⠀⠀')).toEqual([])
  })

  test('a status loader is at most two glyphs: a square of dots, never wider', () => {
    for (const loader of STATUS_LOADERS)
      expect(LOADERS[loader].frames[0]?.length).toBeLessThanOrEqual(2)
    expect(STATUS_LOADERS).toContain(DEFAULT_LOADERS.status)
  })

  test('the status setting takes only a square loader; anything else is the default', () => {
    expect(fitsSetting('status', 'snake')).toBe(true)
    expect(fitsSetting('status', 'helix')).toBe(false)
    expect(fitsSetting('working', 'helix')).toBe(true)
    expect(loadersFrom({ 'ui.statusLoader': 'helix' }).status).toBe(DEFAULT_LOADERS.status)
    expect(loadersFrom({ 'ui.statusLoader': 'orbit' }).status).toBe('orbit')
    expect(loadersFrom({}).status).toBe('diagswipe')
  })

  test('a still loader holds its fullest frame, never a blank one', () => {
    expect(stillFrame('diagswipe')).toBe('⣿⣿')
    for (const loader of STATUS_LOADERS)
      expect(litDots(stillFrame(loader)).length).toBeGreaterThan(0)
  })
})
