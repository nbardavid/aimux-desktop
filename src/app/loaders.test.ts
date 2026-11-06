import { describe, expect, test } from 'bun:test'

import { braille, frameAt, LOADER_NAMES, LOADERS } from './loaders'

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
