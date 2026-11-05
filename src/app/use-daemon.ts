import type { ServerEvent } from '@aimux/ipc'

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
import { attentionFor, openProject, reduceEvent, type SessionState } from '../model/session'

export interface ProjectEntry {
  id: string
  name: string
  lastOpenedAt: string
  projectPath?: string
}

export type DaemonStatus =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'reconnecting' }
  | { kind: 'no-projects' }
  | { kind: 'error'; message: string }

const RETRY_MS = 1000
/** Reconnect attempts between two `ensure_daemon` calls (which autostart a dead daemon). */
const ENSURE_EVERY = 5
const EMPTY: SessionState = { tabs: [], viewports: {} }

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

async function notify(body: string): Promise<void> {
  if (await getCurrentWindow().isFocused()) return
  const granted = (await isPermissionGranted()) || (await requestPermission()) === 'granted'
  if (granted) sendNotification({ body, title: 'aimux' })
}

export function useDaemon() {
  const [projects, setProjects] = useState<ProjectEntry[]>([])
  const [projectId, setProjectId] = useState<string | null>(null)
  const [session, setSession] = useState<SessionState>(EMPTY)
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [status, setStatus] = useState<DaemonStatus>({ kind: 'loading' })
  const client = useRef<DaemonClient | null>(null)
  const project = useRef<string | null>(null)
  const sessionRef = useRef(session)
  sessionRef.current = session

  const onEvent = useCallback((event: ServerEvent) => {
    setSession((state) => reduceEvent(state, event))
    const attention = attentionFor(event)
    if (!attention) return
    const title = sessionRef.current.tabs.find((tab) => tab.id === attention.tabId)?.title
    const name = title ?? 'An agent'
    void notify(attention.kind === 'question' ? `${name} has a question` : `${name} is done`)
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
      } catch {
        client.current = null
        failures += 1
        if (failures % ENSURE_EVERY === 0)
          await invoke('ensure_daemon', { projectId: id }).catch(() => {})
        if (!disposed) setStatus({ kind: 'reconnecting' })
        retry()
      }
    }

    const boot = async () => {
      try {
        const listed = JSON.parse(await invoke<string>('list_projects')) as {
          projects: ProjectEntry[]
        }
        const sorted = listed.projects.toSorted((a, b) =>
          b.lastOpenedAt.localeCompare(a.lastOpenedAt)
        )
        setProjects(sorted)
        const first = sorted[0]
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
    return () => {
      disposed = true
      clearTimeout(timer)
    }
  }, [onEvent, open])

  const selectProject = useCallback(
    (id: string) => {
      project.current = id
      setProjectId(id)
      setSession(EMPTY)
      setActiveTabId(null)
      if (client.current) void open(client.current, id).catch(() => {})
    },
    [open]
  )

  // Fire-and-forget: a request lost to a disconnect is re-done by the user once panes return.
  const actions = useMemo(() => {
    const fire = (request: (target: DaemonClient) => Promise<unknown>) => {
      if (client.current) void request(client.current).catch(() => {})
    }
    return {
      resize: (tabId: string, cols: number, rows: number) =>
        fire(async (c) => c.request('resizeTab', { cols, rows, tabId })),
      scroll: (tabId: string, deltaLines: number) =>
        fire(async (c) => c.request('scroll', { deltaLines, tabId })),
      scrollToBottom: (tabId: string) => fire(async (c) => c.request('scrollToBottom', { tabId })),
      write: (tabId: string, data: string) =>
        fire(async (c) => c.request('write', { data, tabId })),
    }
  }, [])

  return {
    activeTabId,
    projectId,
    projects,
    selectProject,
    ...actions,
    session,
    setActiveTabId,
    status,
  }
}
