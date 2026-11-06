import { expect, test } from 'bun:test'

import type { Artifact } from '../model/catalog'

import { afterClose, browserId, browserTabs, shownView } from './browser-tabs'

const art = (url: string, at: number, closed = false): Artifact => ({
  at,
  chatId: 'c',
  closed,
  title: url,
  url,
})

test('tabs are the open artifacts, newest first', () => {
  expect(browserTabs(undefined)).toEqual([])
  expect(browserTabs([art('a', 1), art('b', 3), art('c', 2, true)]).map((a) => a.url)).toEqual([
    'b',
    'a',
  ])
})

test('closing the tab on screen moves right, else left, else to Changes', () => {
  const tabs = [art('a', 3), art('b', 2), art('c', 1)]
  expect(afterClose({ browser: 'b' }, tabs, 'b')).toEqual({ browser: 'c' })
  expect(afterClose({ browser: 'c' }, tabs, 'c')).toEqual({ browser: 'b' })
  expect(afterClose({ browser: 'a' }, [art('a', 1)], 'a')).toBe('changes')
})

test('closing a tab that is not on screen leaves the view alone', () => {
  const tabs = [art('a', 2), art('b', 1)]
  expect(afterClose({ browser: 'a' }, tabs, 'b')).toEqual({ browser: 'a' })
  expect(afterClose('checks', tabs, 'b')).toBe('checks')
})

test('what shows: checks need a PR, a browser view needs its tab', () => {
  const tabs = [art('a', 1)]
  expect(shownView('checks', false, tabs)).toBe('changes')
  expect(shownView('checks', true, tabs)).toBe('checks')
  expect(shownView({ browser: 'a' }, false, tabs)).toEqual({ browser: 'a' })
  expect(shownView({ browser: 'gone' }, true, tabs)).toBe('changes')
})

test('a page id is stable per url and fits a webview label', () => {
  const id = browserId('https://claude.ai/artifact/Q7qKRZLjujn7avFRs7C3Bv')
  expect(id).toMatch(/^[a-z0-9]{1,24}$/)
  expect(browserId('https://claude.ai/artifact/Q7qKRZLjujn7avFRs7C3Bv')).toBe(id)
  expect(browserId('https://claude.ai/artifact/other')).not.toBe(id)
})
