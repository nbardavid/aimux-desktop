// What the app keeps on disk (store.rs): projects, their worktrees, the chats open in them.

export interface Project {
  id: string
  name: string
  path: string
  lastOpenedAt: number
}

export interface Workspace {
  id: string
  projectId: string
  name: string
  branch: string
  /** What it forked from: `origin/<base>` when the base was refreshed first. */
  base: string
  path: string
  createdAt: number
  setup?: { exitCode: number | null; ranAt: number } | null
  /** What its chats published with Claude Code's `Artifact` tool: the right panel's tabs. */
  artifacts?: Artifact[]
}

/** A published artifact: its claude.ai page, a tab of the right panel until closed. */
export interface Artifact {
  url: string
  title: string
  chatId: string
  /** When it was last published (ms). */
  at: number
  seenAt?: number | null
  /** Kept when closed, so a replayed history doesn't bring it back. */
  closed?: boolean
}

/** Published again (or never opened) since it was last on screen. */
export const isNew = (a: Artifact) => a.seenAt == null || a.seenAt < a.at

export interface ChatRecord {
  id: string
  workspaceId: string
  title: string
  sessionId: string | null
  model: string
  effort: string
  createdAt: number
  /** When a turn last started or ended (ms): the sidebar's age. Absent in older catalogs. */
  activeAt?: number
}

export interface Catalog {
  projects: Project[]
  workspaces: Workspace[]
  chats: ChatRecord[]
}

export type Signal = 'waiting' | 'working' | 'done'

/** The last opened project first; workspaces of each, oldest first, as the sidebar lists them. */
export function byProject(catalog: Catalog): Record<string, Workspace[]> {
  const out: Record<string, Workspace[]> = {}
  for (const project of catalog.projects) out[project.id] = []
  for (const ws of catalog.workspaces.toSorted((a, b) => a.createdAt - b.createdAt)) {
    out[ws.projectId]?.push(ws)
  }
  return out
}

/** What a row should call attention to: a question beats work in progress beats a finished turn. */
export function strongest(signals: readonly (Signal | null)[]): Signal | null {
  if (signals.includes('waiting')) return 'waiting'
  if (signals.includes('working')) return 'working'
  if (signals.includes('done')) return 'done'
  return null
}
