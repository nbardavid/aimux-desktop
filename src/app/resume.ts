// `/resume`: which earlier sessions of the project to offer, in what order, and where one opens.

/** A row of `claude_sessions`. */
export interface Session {
  id: string
  cwd: string
  title: string
  firstPrompt: string
  /** The transcript's mtime, in ms. */
  updatedAt: number
  sizeBytes: number
}

interface Place {
  id: string
  name: string
  path: string
}

export type ResumeTarget =
  | { kind: 'tab'; chatId: string; workspaceId: string }
  | { kind: 'open'; workspaceId: string; cwd: string }

const within = (cwd: string, path: string) => cwd === path || cwd.startsWith(`${path}/`)

/** Nothing to show, or one of aimux's one-shot naming calls: not worth a row. */
export const listable = (s: Session) =>
  (s.title !== '' || s.firstPrompt !== '') &&
  !s.firstPrompt.trimStart().startsWith('Name a workspace for the user request')

/** A session already in a tab is that tab (never a second Claude on it); else where it ran. */
export function resumeTarget(
  session: Session,
  openChats: { id: string; sessionId: string | null; workspaceId: string }[],
  workspaces: { id: string; path: string }[],
  currentWorkspaceId: string
): ResumeTarget {
  const open = openChats.find((c) => c.sessionId === session.id)
  if (open) return { chatId: open.id, kind: 'tab', workspaceId: open.workspaceId }
  const home =
    workspaces.find((w) => w.path === session.cwd) ??
    workspaces.find((w) => w.id === currentWorkspaceId)
  return {
    cwd: home?.path ?? session.cwd,
    kind: 'open',
    workspaceId: home?.id ?? currentWorkspaceId,
  }
}

/** The workspace it ran in, `main`, or the folder of a worktree since deleted. */
export function originLabel(session: Session, workspaces: Place[], mainPath: string): string {
  const w = workspaces.find((x) => within(session.cwd, x.path))
  if (w) return w.name
  if (within(session.cwd, mainPath)) return 'main'
  return session.cwd.split('/').findLast(Boolean) ?? session.cwd
}

/** This workspace's sessions first, then the rest; each newest first. */
export function orderSessions(sessions: Session[], currentPath: string): Session[] {
  const here = (s: Session) => (within(s.cwd, currentPath) ? 0 : 1)
  return sessions.toSorted((a, b) => here(a) - here(b) || b.updatedAt - a.updatedAt)
}
