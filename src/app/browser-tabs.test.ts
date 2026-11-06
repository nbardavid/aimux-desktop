import { expect, test } from 'bun:test'

import type { Artifact } from '../model/catalog'

import {
  afterClose,
  browserId,
  browserTabs,
  pageCap,
  republished,
  shownView,
  withPageTitles,
} from './browser-tabs'

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

test('closing the page on screen moves right, else left, else to the empty Artifacts view', () => {
  const tabs = [art('a', 3), art('b', 2), art('c', 1)]
  expect(afterClose({ browser: 'b' }, tabs, 'b')).toEqual({ browser: 'c' })
  expect(afterClose({ browser: 'c' }, tabs, 'c')).toEqual({ browser: 'b' })
  expect(afterClose({ browser: 'a' }, [art('a', 1)], 'a')).toBe('artifacts')
})

test('closing a tab that is not on screen leaves the view alone', () => {
  const tabs = [art('a', 2), art('b', 1)]
  expect(afterClose({ browser: 'a' }, tabs, 'b')).toEqual({ browser: 'a' })
  expect(afterClose('checks', tabs, 'b')).toBe('checks')
})

test('what shows: checks need a PR; Artifacts opens the last page seen, else the newest', () => {
  const tabs = [art('b', 2), art('a', 1)]
  expect(shownView('checks', false, tabs, null)).toBe('changes')
  expect(shownView('checks', true, tabs, null)).toBe('checks')
  expect(shownView({ browser: 'a' }, false, tabs, null)).toEqual({ browser: 'a' })
  expect(shownView('artifacts', false, tabs, 'a')).toEqual({ browser: 'a' })
  expect(shownView('artifacts', false, tabs, null)).toEqual({ browser: 'b' })
  expect(shownView('artifacts', false, tabs, 'gone')).toEqual({ browser: 'b' })
  expect(shownView({ browser: 'gone' }, true, tabs, null)).toEqual({ browser: 'b' })
  expect(shownView('artifacts', false, [], 'a')).toBe('artifacts')
  expect(shownView({ browser: 'gone' }, false, [], null)).toBe('artifacts')
})

test('a page id is stable per url and fits a webview label', () => {
  const id = browserId('https://claude.ai/artifact/Q7qKRZLjujn7avFRs7C3Bv')
  expect(id).toMatch(/^[a-z0-9]{1,24}$/)
  expect(browserId('https://claude.ai/artifact/Q7qKRZLjujn7avFRs7C3Bv')).toBe(id)
  expect(browserId('https://claude.ai/artifact/other')).not.toBe(id)
})

test('a live publish of a known url is a republish (closed tabs count)', () => {
  const list = [art('a', 1), art('b', 2, true)]
  expect(republished(list, 'a')).toBe(true)
  expect(republished(list, 'b')).toBe(true)
  expect(republished(list, 'c')).toBe(false)
  expect(republished(undefined, 'a')).toBe(false)
})

test("a tab shows Claude's title, else the page's current one, never stored", () => {
  const titled = { ...art('a', 1), title: 'Flow' }
  const untitled = { ...art('b', 1), title: '' }
  const titles = { [browserId('a')]: 'Claude', [browserId('b')]: 'Release notes' }
  expect(withPageTitles([titled, untitled], titles).map((a) => a.title)).toEqual([
    'Flow',
    'Release notes',
  ])
  expect(withPageTitles([untitled], {})[0]?.title).toBe('')
})

test('a page never leaves the chat less than 420px', () => {
  // 1000px window, 221px of sidebar: 358px at most for the page.
  expect(pageCap(1000, 221)).toBe(358)
  expect(pageCap(1440, 0)).toBe(1019)
  expect(pageCap(600, 300)).toBe(0)
})
