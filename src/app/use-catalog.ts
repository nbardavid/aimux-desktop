import { invoke } from '@tauri-apps/api/core'
import { useCallback, useEffect, useMemo, useState } from 'react'

import type { Catalog, ChatRecord, Project, Workspace } from '../model/catalog'

export type CatalogStatus =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'error'; message: string }

const SELECTION = 'aimux.selection'
const EMPTY: Catalog = { chats: [], projects: [], workspaces: [] }

interface Selection {
  projectId: string | null
  workspaceId: string | null
}

function readSelection(): Selection {
  // A convenience: without it the app opens on the last opened project.
  try {
    return {
      projectId: null,
      workspaceId: null,
      ...JSON.parse(localStorage.getItem(SELECTION) ?? '{}'),
    }
  } catch {
    return { projectId: null, workspaceId: null }
  }
}

/** Projects, worktrees and saved chats, as the store keeps them on disk; and what is selected. */
export function useCatalog() {
  const [catalog, setCatalog] = useState<Catalog>(EMPTY)
  const [status, setStatus] = useState<CatalogStatus>({ kind: 'loading' })
  const [selection, setSelectionState] = useState<Selection>(readSelection)

  const reload = useCallback(async () => {
    const next = await invoke<Catalog>('catalog')
    setCatalog(next)
    return next
  }, [])

  useEffect(() => {
    reload().then(
      () => setStatus({ kind: 'ready' }),
      (error: unknown) => setStatus({ kind: 'error', message: String(error) })
    )
  }, [reload])

  const projects = useMemo(
    () => catalog.projects.toSorted((a, b) => b.lastOpenedAt - a.lastOpenedAt),
    [catalog.projects]
  )

  // A selection that no longer exists falls back to the first project and its first worktree.
  const project = projects.find((p) => p.id === selection.projectId) ?? projects[0]
  const inProject = catalog.workspaces.filter((w) => w.projectId === project?.id)
  const workspace = inProject.find((w) => w.id === selection.workspaceId) ?? inProject[0]

  const select = useCallback((projectId: string, workspaceId: string | null) => {
    const next = { projectId, workspaceId }
    setSelectionState(next)
    try {
      localStorage.setItem(SELECTION, JSON.stringify(next))
    } catch {
      // Remembered for the next launch only when storage allows it.
    }
  }, [])

  // Opening a project bumps it to the top of the pickers, as the TUI's recent list does.
  const projectId = project?.id
  useEffect(() => {
    if (projectId !== undefined) void invoke('project_open', { id: projectId }).catch(() => {})
  }, [projectId])

  const addProject = useCallback(
    async (path: string) => {
      const added = await invoke<Project>('project_add', { path })
      await reload()
      select(added.id, null)
      return added
    },
    [reload, select]
  )

  const removeProject = useCallback(
    async (id: string) => {
      await invoke('project_remove', { id })
      await reload()
    },
    [reload]
  )

  const createWorkspace = useCallback(
    async (projectId_: string, candidates: string[], base: string | null) => {
      const created = await invoke<Workspace>('workspace_create', {
        base,
        candidates,
        projectId: projectId_,
      })
      await reload()
      select(projectId_, created.id)
      return created
    },
    [reload, select]
  )

  const removeWorkspace = useCallback(
    async (id: string, force: boolean) => {
      await invoke('workspace_remove', { force, id })
      await reload()
    },
    [reload]
  )

  const saveChat = useCallback(
    (chat: ChatRecord) => void invoke('chat_save', { chat }).catch(() => {}),
    []
  )
  const forgetChat = useCallback(
    (id: string) => void invoke('chat_forget', { id }).catch(() => {}),
    []
  )

  return {
    addProject,
    catalog,
    createWorkspace,
    forgetChat,
    project,
    projects,
    reload,
    removeProject,
    removeWorkspace,
    saveChat,
    select,
    status,
    workspace,
  }
}
