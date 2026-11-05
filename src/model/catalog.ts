import type { ServerEvent, TabSessionSummary } from '@aimux/ipc'

export interface ProjectEntry {
  id: string
  name: string
  lastOpenedAt: string
  projectPath?: string
}

/** `id: null` stands for a project with no workspace records: its tabs carry no workspace. */
export interface WorkspaceEntry {
  id: string | null
  name: string
  branch?: string
  path?: string
  source?: 'primary' | 'aimux-temp' | 'external'
}

export type Signal = 'waiting' | 'working' | 'done'

/** The GUI shows worktrees only: the main checkout is the project, never a workspace of it. */
export const isWorktree = (ws: WorkspaceEntry) => ws.id !== null && ws.source !== 'primary'

/** Every project's worktrees, for the sidebar and the pickers. */
export function worktreesOf(
  all: Record<string, WorkspaceEntry[]>
): Record<string, WorkspaceEntry[]> {
  return Object.fromEntries(
    Object.entries(all).map(([pid, list]) => [pid, list.filter(isWorktree)])
  )
}

/** The primary checkout first, as the TUI lists them; a bare project gets one `root`. */
export function workspacesFor(project: ProjectEntry, listed: WorkspaceEntry[]): WorkspaceEntry[] {
  if (listed.length === 0) return [{ id: null, name: 'root', path: project.projectPath }]
  return listed.toSorted((x, y) => Number(y.source === 'primary') - Number(x.source === 'primary'))
}

/** A tab without a workspace lives in the first one (the primary checkout). */
export function tabsOf(
  tabs: TabSessionSummary[],
  workspace: WorkspaceEntry,
  workspaces: WorkspaceEntry[]
): TabSessionSummary[] {
  const known = new Set(workspaces.map((w) => w.id))
  const isFirst = workspaces[0]?.id === workspace.id
  return tabs.filter((tab) => {
    const id = tab.workspaceId ?? null
    return id === workspace.id || (isFirst && !known.has(id))
  })
}

/** What a row should call attention to: a question beats work in progress beats a finished turn. */
export function signalOf(tabs: TabSessionSummary[], done: ReadonlySet<string>): Signal | null {
  if (tabs.some((tab) => tab.activity === 'waiting-input')) return 'waiting'
  if (tabs.some((tab) => tab.activity === 'working')) return 'working'
  if (tabs.some((tab) => done.has(tab.id))) return 'done'
  return null
}

/** Keeps the tab lists of every project current from the daemon's broadcast events. */
export function applyToProjects(
  byProject: Record<string, TabSessionSummary[]>,
  event: ServerEvent
): Record<string, TabSessionSummary[]> {
  if (event.type !== 'tabStatus') return byProject
  const { projectId, status, tabId } = event.payload
  const tabs = byProject[projectId]
  if (tabs === undefined || !tabs.some((tab) => tab.id === tabId)) return byProject
  return {
    ...byProject,
    [projectId]: tabs.map((tab) => (tab.id === tabId ? { ...tab, activity: status } : tab)),
  }
}
