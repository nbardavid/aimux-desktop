import { expect, test } from 'bun:test'

import { spanColor, xterm256Palette } from './colors'

const base16 = Array.from({ length: 16 }, (_, i) => `#base${i}`)
const palette = xterm256Palette(base16)

test('palette index 196 is #ff0000', () => expect(palette[196]).toBe('#ff0000'))
test('index 232 is #080808', () => expect(palette[232]).toBe('#080808'))
test('index 255 is #eeeeee', () => expect(palette[255]).toBe('#eeeeee'))
test('index 3 comes from base16', () => expect(palette[3]).toBe('#base3'))
test('palette has 256 entries', () => expect(palette).toHaveLength(256))

test('fgPalette wins over fg', () => {
  expect(spanColor({ fg: '#123456', fgPalette: 196, text: 'x' }, 'fg', palette)).toBe('#ff0000')
  expect(spanColor({ bg: '#123456', text: 'x' }, 'bg', palette)).toBe('#123456')
})

test('no color returns undefined', () => {
  expect(spanColor({ text: 'x' }, 'fg', palette)).toBeUndefined()
})
