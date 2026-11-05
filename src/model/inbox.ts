import type { TabSessionSummary } from '@aimux/ipc'

import { isWorktree, type ProjectEntry, type WorkspaceEntry } from './catalog'

export interface InboxEntry {
  kind: 'waiting' | 'done'
  projectId: string
  projectName: string
  workspaceId: string | null
  workspaceName: string
  tabId: string
  title: string
}

/** Every agent that wants you, in every project: questions first, then finished turns. */
export function inboxOf(
  projects: ProjectEntry[],
  workspaces: Record<string, WorkspaceEntry[]>,
  tabsByProject: Record<string, TabSessionSummary[]>,
  done: ReadonlySet<string>
): InboxEntry[] {
  const entries: InboxEntry[] = []
  for (const project of projects) {
    const list = workspaces[project.id] ?? []
    for (const tab of tabsByProject[project.id] ?? []) {
      let kind: InboxEntry['kind'] | null = null
      if (tab.activity === 'waiting-input') kind = 'waiting'
      else if (done.has(tab.id)) kind = 'done'
      if (kind === null) continue
      // A tab without a known workspace lives in the first one, as the sidebar shows it.
      const ws = list.find((w) => w.id === (tab.workspaceId ?? null)) ?? list[0]
      // The main checkout has no place in the GUI: its tabs live in the TUI.
      if (ws === undefined || !isWorktree(ws)) continue
      entries.push({
        kind,
        projectId: project.id,
        projectName: project.name,
        tabId: tab.id,
        title: tab.title,
        workspaceId: ws.id,
        workspaceName: ws.name,
      })
    }
  }
  return entries.toSorted((a, b) => Number(a.kind === 'done') - Number(b.kind === 'done'))
}
