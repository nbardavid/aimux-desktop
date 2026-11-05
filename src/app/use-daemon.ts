import type { ServerEvent, TabSessionSummary } from '@aimux/ipc'

import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { createDaemonClient, type DaemonClient } from '../daemon/client'
import { createTauriLink } from '../daemon/tauri-link'
import {
  applyToProjects,
  type ProjectEntry,
  tabsOf,
  type WorkspaceEntry,
  workspacesFor,
} from '../model/catalog'
import { attentionFor, openProject, reduceEvent, type SessionState } from '../model/session'

export type DaemonStatus =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'reconnecting' }
  | { kind: 'no-projects' }
  | { kind: 'error'; message: string }

export interface Attention {
  kind: 'question' | 'done'
  projectId: string
  tabId: string
  title: string
  projectName: string
}

const RETRY_MS = 1000
/** Reconnect attempts between two `ensure_daemon` calls (which autostart a dead daemon). */
const ENSURE_EVERY = 5
/** Tab lists of the projects the GUI is not attached to. */
const OTHER_PROJECTS_REFRESH_MS = 10_000
const EMPTY: SessionState = { tabs: [], viewports: {} }

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

async function notify(body: string): Promise<void> {
  const granted = (await isPermissionGranted()) || (await requestPermission()) === 'granted'
  if (granted) sendNotification({ body, title: 'aimux' })
}

async function loadWorkspaces(project: ProjectEntry): Promise<WorkspaceEntry[]> {
  try {
    const raw = await invoke<string>('list_workspaces', { projectId: project.id })
    return workspacesFor(project, (JSON.parse(raw) as { workspaces: WorkspaceEntry[] }).workspaces)
  } catch {
    return workspacesFor(project, [])
  }
}

async function loadCatalog() {
  const listed = JSON.parse(await invoke<string>('list_projects')) as { projects: ProjectEntry[] }
  const projects = listed.projects.toSorted((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt))
  const loaded = await Promise.all(projects.map(async (p) => [p.id, await loadWorkspaces(p)]))
  return { projects, workspaces: Object.fromEntries(loaded) as Record<string, WorkspaceEntry[]> }
}

const sleep = async (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export function useDaemon() {
  const [status, setStatus] = useState<DaemonStatus>({ kind: 'loading' })
  const [projects, setProjects] = useState<ProjectEntry[]>([])
  const [workspaces, setWorkspaces] = useState<Record<string, WorkspaceEntry[]>>({})
  const [otherTabs, setOtherTabs] = useState<Record<string, TabSessionSummary[]>>({})
  const [projectId, setProjectId] = useState<string | null>(null)
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [session, setSession] = useState<SessionState>(EMPTY)
  const [done, setDone] = useState<ReadonlySet<string>>(new Set())
  const [attention, setAttention] = useState<Attention | null>(null)
  const client = useRef<DaemonClient | null>(null)
  const project = useRef<string | null>(null)
  const latest = useRef({ activeTabId, otherTabs, projects, session })
  latest.current = { activeTabId, otherTabs, projects, session }

  const onEvent = useCallback((event: ServerEvent) => {
    setSession((state) => reduceEvent(state, event))
    setOtherTabs((state) => applyToProjects(state, event))
    if (event.type === 'tabStatus' && event.payload.status !== 'idle') {
      const { tabId } = event.payload
      setDone((state) =>
        state.has(tabId) ? new Set([...state].filter((id) => id !== tabId)) : state
      )
    }
    const hit = attentionFor(event)
    if (!hit || !('projectId' in event.payload)) return
    const { projectId: pid } = event.payload
    const now = latest.current
    const tabs = pid === project.current ? now.session.tabs : (now.otherTabs[pid] ?? [])
    const entry: Attention = {
      ...hit,
      projectId: pid,
      projectName: now.projects.find((p) => p.id === pid)?.name ?? '',
      title: tabs.find((tab) => tab.id === hit.tabId)?.title ?? 'A tab',
    }
    const watching = pid === project.current && now.activeTabId === hit.tabId
    void (async () => {
      const focused = await getCurrentWindow().isFocused()
      if (focused && watching) return
      if (hit.kind === 'done') setDone((state) => new Set(state).add(hit.tabId))
      if (!focused) {
        const verb = hit.kind === 'question' ? 'is waiting for you' : 'is done'
        await notify(`${entry.title} ${verb}`)
      } else if (hit.kind === 'question') {
        setAttention(entry)
      }
    })()
  }, [])

  const open = useCallback(async (target: DaemonClient, id: string) => {
    const opened = await openProject(target, id)
    if (project.current !== id) return
    setSession({ tabs: opened.tabs, viewports: opened.viewports })
    // A reconnect keeps the tab the user was on.
    setActiveTabId((current) =>
      opened.tabs.some((tab) => tab.id === current) ? current : opened.activeTabId
    )
  }, [])

  const refreshOthers = useCallback(async (target: DaemonClient) => {
    const entries = await Promise.all(
      latest.current.projects
        .filter((p) => p.id !== project.current)
        .map(async (p) => {
          const listed = await target.request('listTabs', { projectId: p.id }).catch(() => null)
          return [p.id, listed?.type === 'listTabsResult' ? listed.payload.tabs : []] as const
        })
    )
    setOtherTabs(Object.fromEntries(entries))
  }, [])

  useEffect(() => {
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let failures = 0

    const retry = () => {
      if (disposed || timer !== undefined) return
      timer = setTimeout(() => {
        timer = undefined
        void connect()
      }, RETRY_MS)
    }

    const connect = async () => {
      const id = project.current
      if (id === null) return
      try {
        const next = createDaemonClient(await createTauriLink())
        next.onEvent(onEvent)
        next.onClose(() => {
          if (client.current !== next) return
          client.current = null
          setStatus({ kind: 'reconnecting' })
          retry()
        })
        client.current = next
        await open(next, id)
        failures = 0
        if (!disposed) setStatus({ kind: 'ready' })
        await refreshOthers(next)
      } catch {
        client.current = null
        failures += 1
        if (failures % ENSURE_EVERY === 0) {
          await invoke('ensure_daemon', { projectId: id }).catch(() => {})
        }
        if (!disposed) setStatus({ kind: 'reconnecting' })
        retry()
      }
    }

    const boot = async () => {
      try {
        const catalog = await loadCatalog()
        setProjects(catalog.projects)
        setWorkspaces(catalog.workspaces)
        latest.current.projects = catalog.projects
        const first = catalog.projects[0]
        if (!first) {
          setStatus({ kind: 'no-projects' })
          return
        }
        project.current = first.id
        setProjectId(first.id)
        await invoke('ensure_daemon', { projectId: first.id })
        await connect()
      } catch (error) {
        setStatus({ kind: 'error', message: errorMessage(error) })
      }
    }

    void boot()
    const refresher = setInterval(() => {
      if (client.current) void refreshOthers(client.current)
    }, OTHER_PROJECTS_REFRESH_MS)
    return () => {
      disposed = true
      clearTimeout(timer)
      clearInterval(refresher)
    }
  }, [onEvent, open, refreshOthers])

  const selectTab = useCallback((tabId: string | null) => {
    setActiveTabId(tabId)
    if (tabId !== null) {
      setDone((state) =>
        state.has(tabId) ? new Set([...state].filter((id) => id !== tabId)) : state
      )
    }
  }, [])

  const selectWorkspace = useCallback(
    (pid: string, wid: string | null, tabId?: string) => {
      setWorkspaceId(wid)
      setAttention(null)
      if (pid === project.current) {
        const list = workspaces[pid] ?? []
        const ws = list.find((w) => w.id === wid)
        const first = ws ? tabsOf(latest.current.session.tabs, ws, list)[0] : undefined
        selectTab(tabId ?? first?.id ?? null)
        return
      }
      project.current = pid
      setProjectId(pid)
      setOtherTabs((state) => ({ ...state, [pid]: [] }))
      setSession(EMPTY)
      selectTab(tabId ?? null)
      const target = client.current
      if (!target) return
      void (async () => {
        await open(target, pid)
        if (tabId === undefined) {
          const list = workspaces[pid] ?? []
          const ws = list.find((w) => w.id === wid)
          const first = ws ? tabsOf(latest.current.session.tabs, ws, list)[0] : undefined
          if (first) selectTab(first.id)
        }
        await refreshOthers(target)
      })().catch(() => {})
    },
    [open, refreshOthers, selectTab, workspaces]
  )

  // Fire-and-forget: a request lost to a disconnect is re-done by the user once panes return.
  const actions = useMemo(() => {
    const fire = (request: (target: DaemonClient) => Promise<unknown>) => {
      if (client.current) void request(client.current).catch(() => {})
    }
    return {
      closeTab: (tabId: string) => fire(async (c) => c.request('closeTab', { tabId })),
      resize: (tabId: string, cols: number, rows: number) =>
        fire(async (c) => c.request('resizeTab', { cols, rows, tabId })),
      scroll: (tabId: string, deltaLines: number) =>
        fire(async (c) => c.request('scroll', { deltaLines, tabId })),
      scrollToBottom: (tabId: string) => fire(async (c) => c.request('scrollToBottom', { tabId })),
      write: (tabId: string, data: string) =>
        fire(async (c) => c.request('write', { data, tabId })),
    }
  }, [])

  const createTab = useCallback(
    async (assistant: string, wid: string | null) => {
      const pid = project.current
      if (pid === null) return
      const raw = await invoke<string>('create_tab', {
        assistant,
        projectId: pid,
        workspaceId: wid,
      })
      const created = JSON.parse(raw) as { tabId?: string }
      if (created.tabId !== undefined) selectTab(created.tabId)
    },
    [selectTab]
  )

  const reloadCatalog = useCallback(async () => {
    const catalog = await loadCatalog()
    setProjects(catalog.projects)
    setWorkspaces(catalog.workspaces)
    latest.current.projects = catalog.projects
    return catalog
  }, [])

  /** With the TUI attached, the TUI performs the create: poll the catalog until it lands. */
  const createProject = useCallback(
    async (path: string) => {
      const name = path.split('/').findLast((part) => part !== '') ?? path
      await invoke('create_project', { name, path })
      for (let attempt = 0; attempt < 10; attempt++) {
        const catalog = await reloadCatalog()
        const created = catalog.projects.find((p) => p.projectPath === path)
        if (created) {
          selectWorkspace(created.id, catalog.workspaces[created.id]?.[0]?.id ?? null)
          return
        }
        await sleep(300)
      }
    },
    [reloadCatalog, selectWorkspace]
  )

  const createWorkspace = useCallback(
    async (pid: string, name: string, base: string | null) => {
      const raw = await invoke<string>('create_workspace', { base, name, projectId: pid })
      const created = JSON.parse(raw) as { id?: string }
      await reloadCatalog()
      if (created.id !== undefined) selectWorkspace(pid, created.id)
    },
    [reloadCatalog, selectWorkspace]
  )

  const tabsByProject = useMemo(
    () => (projectId === null ? otherTabs : { ...otherTabs, [projectId]: session.tabs }),
    [otherTabs, projectId, session.tabs]
  )

  return {
    activeTabId,
    attention,
    createProject,
    createTab,
    createWorkspace,
    dismissAttention: () => setAttention(null),
    done,
    projectId,
    projects,
    selectTab,
    selectWorkspace,
    session,
    status,
    tabsByProject,
    workspaceId,
    workspaces,
    ...actions,
  }
}

export type Daemon = ReturnType<typeof useDaemon>
