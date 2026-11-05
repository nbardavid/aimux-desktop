import type { TabSessionSummary } from '@aimux/ipc'

import { expect, test } from 'bun:test'

import { inboxOf } from './inbox'

const tab = (id: string, activity: string, workspaceId?: string) =>
  ({ activity, id, title: id, workspaceId }) as unknown as TabSessionSummary

test('questions before finished turns, worktrees only', () => {
  const entries = inboxOf(
    [{ id: 'p', lastOpenedAt: '', name: 'demo' }],
    {
      p: [
        { id: 'w0', name: 'root', source: 'primary' },
        { id: 'w1', name: 'cedar' },
        { id: 'w2', name: 'opal' },
      ],
    },
    {
      p: [
        tab('a', 'idle', 'w1'),
        tab('b', 'waiting-input', 'w2'),
        tab('c', 'working', 'w1'),
        tab('d', 'waiting-input'),
      ],
    },
    new Set(['a'])
  )
  // `d` lives in the main checkout: the GUI leaves it to the TUI.
  expect(entries.map((e) => [e.tabId, e.kind, e.workspaceName])).toEqual([
    ['b', 'waiting', 'opal'],
    ['a', 'done', 'cedar'],
  ])
})
