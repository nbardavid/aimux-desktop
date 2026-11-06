import { expect, test } from 'bun:test'

import { splitTabs, tabsToDraw, withLeaving } from './tab-bar'

const tabs = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id }))
const ids = (list: { id: string }[]) => list.map((t) => t.id)

test('every tab shows while each keeps ~100px', () => {
  expect(ids(splitTabs(tabs, 'a', 600).shown)).toEqual(ids(tabs))
  expect(splitTabs(tabs, 'a', 600).hidden).toEqual([])
})

test('the rest wait in "+N", in order', () => {
  const { hidden, shown } = splitTabs(tabs, 'b', 450)
  expect(ids(shown)).toEqual(['a', 'b', 'c', 'd'])
  expect(ids(hidden)).toEqual(['e', 'f'])
})

test('the tab on screen always shows, in its place', () => {
  const { hidden, shown } = splitTabs(tabs, 'f', 450)
  expect(ids(shown)).toEqual(['a', 'b', 'c', 'f'])
  expect(ids(hidden)).toEqual(['d', 'e'])
})

test('a wide tab on screen leaves room for fewer others', () => {
  expect(ids(splitTabs(tabs, 'c', 600, 240).shown)).toEqual(['a', 'b', 'c', 'd'])
  expect(ids(splitTabs(tabs, 'c', 300, 240).shown)).toEqual(['c'])
})

test('a bar too narrow for two still shows the one on screen', () => {
  expect(ids(splitTabs(tabs, 'e', 90).shown)).toEqual(['e'])
})

test('a closed tab stays in its place while it slides shut', () => {
  const t = (...list: string[]) => list.map((id) => ({ id }))
  expect(ids(withLeaving(t('a', 'b', 'c'), t('a', 'c')))).toEqual(['a', 'b', 'c'])
  expect(ids(withLeaving(t('a', 'b', 'c'), t('b', 'c')))).toEqual(['a', 'b', 'c'])
  expect(ids(withLeaving(t('a', 'b', 'c'), t('a', 'c', 'd')))).toEqual(['a', 'b', 'c', 'd'])
  expect(ids(withLeaving(t('a', 'b'), t()))).toEqual(['a', 'b'])
})

test('a window resized moves tabs into "+N" and back without a slide', () => {
  const t = (...list: string[]) => list.map((id) => ({ id }))
  const all = t('a', 'b', 'c')
  const none = new Set<string>()
  // 1440, then 1000 (c waits in +N), then 1440, then 1000 again.
  let prev = { drawn: all, ids: ['a', 'b', 'c'] }
  for (const width of [1000, 1440, 1000]) {
    const { shown } = splitTabs(all, 'a', width === 1440 ? 400 : 250)
    const next = tabsToDraw(prev, all, shown, none)
    expect(ids(next.drawn)).toEqual(ids(shown))
    expect([...next.entering]).toEqual([])
    prev = { drawn: next.drawn, ids: ['a', 'b', 'c'] }
  }
  // The same split as a fresh load at 1000.
  expect(ids(prev.drawn)).toEqual(ids(splitTabs(all, 'a', 250).shown))
})

test('a tab opened slides open, a tab closed slides shut in its place', () => {
  const t = (...list: string[]) => list.map((id) => ({ id }))
  const none = new Set<string>()
  const prev = { drawn: t('a', 'b'), ids: ['a', 'b'] }
  const opened = tabsToDraw(prev, t('a', 'b', 'c'), t('a', 'b', 'c'), none)
  expect(ids(opened.drawn)).toEqual(['a', 'b', 'c'])
  expect([...opened.entering]).toEqual(['c'])
  const closed = tabsToDraw(prev, t('b'), t('b'), none)
  expect(ids(closed.drawn)).toEqual(['a', 'b'])
  expect(ids(tabsToDraw(prev, t('b'), t('b'), new Set(['a'])).drawn)).toEqual(['b'])
  // Another workspace: its tabs just show.
  expect(tabsToDraw(prev, t('x', 'y'), t('x', 'y'), none)).toEqual({
    drawn: t('x', 'y'),
    entering: new Set(),
  })
})
