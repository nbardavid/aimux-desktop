import { expect, test } from 'bun:test'

import { inboxOf } from './inbox'

test('questions before finished turns, nothing else', () => {
  const workspaces = [
    {
      base: 'main',
      branch: 'aimux/cedar',
      createdAt: 0,
      id: 'w1',
      name: 'cedar',
      path: '/w1',
      projectId: 'p',
    },
  ]
  const entries = inboxOf(
    [
      { signal: 'done', tabId: 'a', title: 'A', workspaceId: 'w1' },
      { signal: 'working', tabId: 'b', title: 'B', workspaceId: 'w1' },
      { signal: 'waiting', tabId: 'c', title: 'C', workspaceId: 'w1' },
      { signal: 'waiting', tabId: 'd', title: 'D', workspaceId: 'gone' },
    ],
    [{ id: 'p', lastOpenedAt: 0, name: 'demo', path: '/p' }],
    workspaces
  )
  expect(entries.map((e) => [e.tabId, e.kind, e.workspaceName])).toEqual([
    ['c', 'waiting', 'cedar'],
    ['a', 'done', 'cedar'],
  ])
})
