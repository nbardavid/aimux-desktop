import { expect, test } from 'bun:test'

import type { Project, Workspace } from '../model/catalog'

import { afterClose, appShortcut, paletteItems, paletteTarget, stepThrough } from './navigation'
import { matchParts } from './picker'

const project = (id: string, name: string): Project => ({
  id,
  lastOpenedAt: 0,
  name,
  path: `/dev/${name}`,
})
const ws = (id: string, projectId: string): Workspace => ({
  base: 'main',
  branch: `aimux/${id}`,
  createdAt: 0,
  id,
  name: id,
  path: `/trees/${id}`,
  projectId,
})

const projects = [project('p1', 'aimux-desktop'), project('p2', 'pragma-once')]
const workspaces = {
  p1: [ws('amber', 'p1'), ws('teal', 'p1')],
  p2: [ws('violet', 'p2')],
}

test('⌘P lists workspaces in sidebar order, then chats, then projects', () => {
  const items = paletteItems(
    projects,
    workspaces,
    [
      { id: 'c1', title: 'Port the menus', workspaceId: 'amber' },
      { id: 'c2', title: 'Orphan', workspaceId: 'gone' },
    ],
    { teal: 'waiting' },
    'amber'
  )
  expect(items.map((i) => i.key)).toEqual([
    'ws:amber',
    'ws:teal',
    'ws:violet',
    'chat:c1',
    'project:p1',
    'project:p2',
  ])
  expect(items[0]).toMatchObject({
    label: 'amber · aimux-desktop',
    meta: 'current',
  })
  expect(items[1]).toMatchObject({ meta: undefined, signal: 'waiting' })
  expect(items[3]).toMatchObject({
    label: 'Port the menus',
    sub: 'aimux-desktop · amber',
  })
  expect(items[5]).toMatchObject({
    meta: '1 workspace',
    sub: '/dev/pragma-once',
  })
})

test('a ⌘P key says what it points at', () => {
  expect(paletteTarget('ws:amber')).toEqual({ id: 'amber', kind: 'ws' })
  expect(paletteTarget('chat:a:b')).toEqual({ id: 'a:b', kind: 'chat' })
})

test('closing the tab on screen shows its right neighbour, or its left one when last', () => {
  const ids = ['a', 'b', 'c']
  expect(afterClose(ids, 'b', 'b')).toBe('c')
  expect(afterClose(ids, 'c', 'c')).toBe('b')
  expect(afterClose(ids, 'a', 'a')).toBe('b')
  expect(afterClose(['a'], 'a', 'a')).toBeUndefined()
  // Another tab closing leaves the one on screen be.
  expect(afterClose(ids, 'a', 'c')).toBe('c')
})

test('next and previous wrap around', () => {
  const ids = ['a', 'b', 'c']
  expect(stepThrough(ids, 'b', 1)).toBe('c')
  expect(stepThrough(ids, 'c', 1)).toBe('a')
  expect(stepThrough(ids, 'a', -1)).toBe('c')
  expect(stepThrough(ids, undefined, 1)).toBe('a')
  expect(stepThrough(ids, 'gone', -1)).toBe('c')
  expect(stepThrough([], 'a', 1)).toBeUndefined()
})

test('a focused terminal lets the app’s shortcuts through, and keeps its own', () => {
  const key = (code: string, key: string, mods: Partial<KeyboardEvent> = {}) =>
    appShortcut({
      altKey: false,
      code,
      ctrlKey: false,
      key,
      metaKey: false,
      ...mods,
    })
  expect(key('KeyW', 'w', { metaKey: true })).toBe(true)
  expect(key('KeyO', 'o', { metaKey: true })).toBe(true)
  expect(key('KeyL', 'l', { metaKey: true })).toBe(true)
  expect(key('Digit3', '3', { metaKey: true })).toBe(true)
  expect(key('Digit3', '3', { ctrlKey: true })).toBe(true)
  expect(key('Tab', 'Tab', { ctrlKey: true, shiftKey: true })).toBe(true)
  expect(key('ArrowDown', 'ArrowDown', { altKey: true, metaKey: true })).toBe(true)
  expect(key('KeyB', '∫', { altKey: true, metaKey: true })).toBe(true)
  expect(key('KeyC', 'c', { metaKey: true })).toBe(false)
  expect(key('KeyV', 'v', { metaKey: true })).toBe(false)
  expect(key('KeyC', 'c', { ctrlKey: true })).toBe(false)
  expect(key('ArrowUp', 'ArrowUp')).toBe(false)
})

test('⌘P with nothing typed: Recent first, then the latest active, then projects', () => {
  const items = paletteItems(
    projects,
    workspaces,
    [
      { activeAt: 10, id: 'c1', title: 'Port the menus', workspaceId: 'amber' },
      { activeAt: 30, id: 'c2', title: 'Release notes', workspaceId: 'teal' },
      { activeAt: 20, id: 'c3', title: 'Stat tiles', workspaceId: 'violet' },
    ],
    {},
    'amber',
    {
      activeAt: { amber: 10, teal: 30, violet: 20 },
      here: 'chat:c1',
      // The latest first; the place on screen and a gone chat never show.
      recent: ['chat:c1', 'ws:violet', 'chat:gone', 'ws:amber', 'chat:c2', 'ws:violet'],
    }
  )
  expect(items.map((i) => `${i.section}:${i.key}`)).toEqual([
    'Recent:ws:violet',
    'Recent:chat:c2',
    'Workspaces:ws:teal',
    'Workspaces:ws:amber',
    'Chats:chat:c3',
    'Chats:chat:c1',
    'Projects:project:p1',
    'Projects:project:p2',
  ])
})

test('⌘P Recent lists a chat, not the bare workspace it is in', () => {
  const items = paletteItems(
    projects,
    workspaces,
    [
      { activeAt: 10, id: 'c1', title: 'Port the menus', workspaceId: 'amber' },
      { activeAt: 30, id: 'c2', title: 'Release notes', workspaceId: 'teal' },
    ],
    {},
    'violet',
    { recent: ['ws:violet', 'chat:c2', 'ws:amber', 'chat:c1', 'ws:teal'] }
  )
  expect(items.filter((i) => i.section === 'Recent').map((i) => i.key)).toEqual([
    'chat:c2',
    'chat:c1',
  ])
  // Still listed with the other workspaces.
  expect(items.some((i) => i.section === 'Workspaces' && i.key === 'ws:amber')).toBe(true)
})

test('⌘P keeps five places in Recent', () => {
  const many = { p1: ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => ws(id, 'p1')) }
  const items = paletteItems([projects[0] as Project], many, [], {}, null, {
    recent: ['ws:a', 'ws:b', 'ws:c', 'ws:d', 'ws:e', 'ws:f', 'ws:g'],
  })
  expect(items.filter((i) => i.section === 'Recent').map((i) => i.key)).toEqual([
    'ws:a',
    'ws:b',
    'ws:c',
    'ws:d',
    'ws:e',
  ])
})

test('⌘P shows what the filter matched, in any case', () => {
  expect(matchParts('Port the Menus', 'menu')).toEqual([
    { hit: false, text: 'Port the ' },
    { hit: true, text: 'Menu' },
    { hit: false, text: 's' },
  ])
  expect(matchParts('amber', 'am')).toEqual([
    { hit: true, text: 'am' },
    { hit: false, text: 'ber' },
  ])
  expect(matchParts('amber', '')).toEqual([{ hit: false, text: 'amber' }])
  expect(matchParts('amber', 'teal')).toEqual([{ hit: false, text: 'amber' }])
})
