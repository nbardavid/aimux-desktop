import { expect, test } from 'bun:test'

import { type Artifact, byProject, type Catalog, isNew, strongest, type Workspace } from './catalog'

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

const a: Artifact = { at: 10, chatId: 'c', title: 'Flow', url: 'https://claude.ai/artifact/x' }

test('an artifact is new until seen after its last publish', () => {
  expect(isNew(a)).toBe(true)
  expect(isNew({ ...a, seenAt: null })).toBe(true)
  expect(isNew({ ...a, seenAt: 5 })).toBe(true)
  expect(isNew({ ...a, seenAt: 10 })).toBe(false)
  expect(isNew({ ...a, seenAt: 12 })).toBe(false)
})
