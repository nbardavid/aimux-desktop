import { expect, test } from 'bun:test'

import { listable, orderSessions, originLabel, resumeTarget, type Session } from './resume'

const session = (o: Partial<Session>): Session => ({
  cwd: '/p/app',
  firstPrompt: 'fix the tests',
  id: 's',
  sizeBytes: 0,
  title: '',
  updatedAt: 0,
  ...o,
})
const amber = { id: 'w1', name: 'amber', path: '/data/worktrees/p/amber' }
const coral = { id: 'w2', name: 'coral', path: '/data/worktrees/p/coral' }

test('a session open in a tab, even in another workspace, goes to that tab', () => {
  const chats = [{ id: 'c1', sessionId: 's', workspaceId: 'w2' }]
  expect(resumeTarget(session({}), chats, [amber, coral], 'w1')).toEqual({
    chatId: 'c1',
    kind: 'tab',
    workspaceId: 'w2',
  })
})

test('a session of a workspace opens there', () => {
  expect(resumeTarget(session({ cwd: coral.path }), [], [amber, coral], 'w1')).toEqual({
    cwd: coral.path,
    kind: 'open',
    workspaceId: 'w2',
  })
})

test('any other session opens in the current workspace', () => {
  expect(resumeTarget(session({ cwd: '/p/app' }), [], [amber, coral], 'w1')).toEqual({
    cwd: amber.path,
    kind: 'open',
    workspaceId: 'w1',
  })
})

test('origin: workspace, main, or a deleted worktree’s folder', () => {
  const list = [amber, coral]
  expect(originLabel(session({ cwd: amber.path }), list, '/p/app')).toBe('amber')
  expect(originLabel(session({ cwd: '/p/app/src' }), list, '/p/app')).toBe('main')
  expect(originLabel(session({ cwd: '/data/worktrees/p/teal' }), list, '/p/app')).toBe(
    'teal (deleted)'
  )
  expect(originLabel(session({ cwd: '/p/app-old' }), list, '/p/app')).toBe('app-old (deleted)')
})

test('the current workspace’s sessions come first, each group newest first', () => {
  const list = [
    session({ cwd: '/p/app', id: 'a', updatedAt: 9 }),
    session({ cwd: amber.path, id: 'b', updatedAt: 1 }),
    session({ cwd: '/p/app', id: 'c', updatedAt: 5 }),
    session({ cwd: `${amber.path}/sub`, id: 'd', updatedAt: 3 }),
  ]
  expect(orderSessions(list, amber.path).map((s) => s.id)).toEqual(['d', 'b', 'a', 'c'])
})

test('only sessions worth resuming are listed', () => {
  expect(listable(session({}))).toBe(true)
  expect(listable(session({ firstPrompt: '', title: 'Named' }))).toBe(true)
  expect(listable(session({ firstPrompt: '', title: '' }))).toBe(false)
  expect(
    listable(session({ firstPrompt: 'Name a workspace for the user request: fix it', title: 'x' }))
  ).toBe(false)
})
