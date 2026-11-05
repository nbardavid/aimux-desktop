import type { TabSessionSummary } from '@aimux/ipc'

import { expect, test } from 'bun:test'

import { applyToProjects, signalOf, tabsOf, type WorkspaceEntry, workspacesFor } from './catalog'

const project = { id: 'p', lastOpenedAt: '', name: 'p', projectPath: '/p' }
const tab = (id: string, extra: Partial<TabSessionSummary> = {}): TabSessionSummary => ({
  assistant: 'claude',
  command: 'claude',
  id,
  status: 'running',
  title: id,
  ...extra,
})

test('a project without workspaces gets one root', () => {
  expect(workspacesFor(project, [])).toEqual([{ id: null, name: 'root', path: '/p' }])
})

test('the primary checkout comes first', () => {
  const listed: WorkspaceEntry[] = [
    { id: 'w2', name: 'feat', source: 'aimux-temp' },
    { id: 'w1', name: 'root', source: 'primary' },
  ]
  expect(workspacesFor(project, listed).map((w) => w.id)).toEqual(['w1', 'w2'])
})

test('tabs without a known workspace go to the first one', () => {
  const root: WorkspaceEntry = { id: 'w1', name: 'root' }
  const feat: WorkspaceEntry = { id: 'w2', name: 'feat' }
  const workspaces = [root, feat]
  const tabs = [tab('a'), tab('b', { workspaceId: 'w2' }), tab('c', { workspaceId: 'gone' })]
  expect(tabsOf(tabs, root, workspaces).map((t) => t.id)).toEqual(['a', 'c'])
  expect(tabsOf(tabs, feat, workspaces).map((t) => t.id)).toEqual(['b'])
})

test('a question beats work beats a finished turn', () => {
  const done = new Set(['a'])
  expect(signalOf([tab('a')], done)).toBe('done')
  expect(signalOf([tab('a'), tab('b', { activity: 'working' })], done)).toBe('working')
  expect(
    signalOf([tab('b', { activity: 'waiting-input' }), tab('c', { activity: 'working' })], done)
  ).toBe('waiting')
  expect(signalOf([tab('z', { activity: 'idle' })], new Set())).toBeNull()
})

test('tabStatus updates the tab in its own project only', () => {
  const byProject = { p: [tab('a')], q: [tab('b')] }
  const next = applyToProjects(byProject, {
    payload: { projectId: 'q', status: 'working', tabId: 'b' },
    type: 'tabStatus',
  })
  expect(next.q?.[0]?.activity).toBe('working')
  expect(next.p).toBe(byProject.p)
  const unknown = {
    payload: { projectId: 'q', status: 'idle' as const, tabId: 'x' },
    type: 'tabStatus' as const,
  }
  expect(applyToProjects(byProject, unknown)).toBe(byProject)
})
