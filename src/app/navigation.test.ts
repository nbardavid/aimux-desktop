import { expect, test } from 'bun:test'

import type { Project, Workspace } from '../model/catalog'

import { afterClose, paletteItems, paletteTarget, stepThrough } from './navigation'

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
const workspaces = { p1: [ws('amber', 'p1'), ws('teal', 'p1')], p2: [ws('violet', 'p2')] }

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
  expect(items[0]).toMatchObject({ label: 'amber · aimux-desktop', meta: 'current' })
  expect(items[1]).toMatchObject({ meta: undefined, signal: 'waiting' })
  expect(items[3]).toMatchObject({ label: 'Port the menus', sub: 'aimux-desktop · amber' })
  expect(items[5]).toMatchObject({ meta: '1 workspace', mono: true, sub: '/dev/pragma-once' })
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
