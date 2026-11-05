import { expect, test } from 'bun:test'

import { byProject, type Catalog, strongest, type Workspace } from './catalog'

const ws = (id: string, projectId: string, createdAt: number): Workspace => ({
  base: 'main',
  branch: `aimux/${id}`,
  createdAt,
  id,
  name: id,
  path: `/wt/${id}`,
  projectId,
})

test('workspaces group under their project, oldest first', () => {
  const catalog: Catalog = {
    chats: [],
    projects: [
      { id: 'p', lastOpenedAt: 0, name: 'p', path: '/p' },
      { id: 'q', lastOpenedAt: 0, name: 'q', path: '/q' },
    ],
    workspaces: [ws('b', 'p', 2), ws('a', 'p', 1), ws('x', 'gone', 0)],
  }
  expect(byProject(catalog)).toEqual({ p: [ws('a', 'p', 1), ws('b', 'p', 2)], q: [] })
})

test('a question beats work in progress beats a finished turn', () => {
  expect(strongest(['done', 'working', null])).toBe('working')
  expect(strongest(['done', 'waiting'])).toBe('waiting')
  expect(strongest([null])).toBe(null)
})
