import type { Project, Signal, Workspace } from './catalog'

/** A tab and what it calls attention to, wherever it lives. */
export interface TabSignal {
  tabId: string
  workspaceId: string
  title: string
  signal: Signal | null
}

export interface InboxEntry {
  kind: 'waiting' | 'done'
  projectId: string
  projectName: string
  workspaceId: string
  workspaceName: string
  tabId: string
  title: string
}

/** Every agent that wants you, in every project: questions first, then finished turns. */
export function inboxOf(
  tabs: readonly TabSignal[],
  projects: readonly Project[],
  workspaces: readonly Workspace[]
): InboxEntry[] {
  const entries: InboxEntry[] = []
  for (const tab of tabs) {
    if (tab.signal !== 'waiting' && tab.signal !== 'done') continue
    const ws = workspaces.find((w) => w.id === tab.workspaceId)
    const project = projects.find((p) => p.id === ws?.projectId)
    if (!ws || !project) continue
    entries.push({
      kind: tab.signal,
      projectId: project.id,
      projectName: project.name,
      tabId: tab.tabId,
      title: tab.title,
      workspaceId: ws.id,
      workspaceName: ws.name,
    })
  }
  return entries.toSorted((a, b) => Number(a.kind === 'done') - Number(b.kind === 'done'))
}
