import type { TabSessionSummary } from '@aimux/ipc'

import { type ReactNode, useState } from 'react'

import { type ProjectEntry, signalOf, tabsOf, type WorkspaceEntry } from '../model/catalog'
import { Icon } from './icons'
import { StatusDot } from './status-dot'

export interface DiffStat {
  add: number
  del: number
}

interface Props {
  projects: ProjectEntry[]
  workspaces: Record<string, WorkspaceEntry[]>
  tabsByProject: Record<string, TabSessionSummary[]>
  done: ReadonlySet<string>
  diffs: Record<string, DiffStat>
  projectId: string | null
  workspaceId: string | null
  page: 'stats' | 'settings' | null
  onSelect: (projectId: string, workspaceId: string | null) => void
  onProjects: () => void
  onNewProject: () => void
  onNewWorkspace: (projectId: string) => void
  onStats: () => void
  onSettings: () => void
  onHide: () => void
  width: number
  /** Quotas, at the left of the foot. */
  foot: ReactNode
  connected: boolean
}

const AVATAR_TONES = ['#525890', '#5b7a5e', '#8a5a44', '#6b5b8a', '#44707f', '#8a6d2f']

/** A project's initial on a tone picked from its name, so it keeps its colour. */
export function ProjectAvatar({ name }: { name: string }) {
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return (
    <span
      className="avatar"
      style={{ background: AVATAR_TONES[hash % AVATAR_TONES.length] }}
      aria-hidden="true"
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  )
}

export function Sidebar(props: Props) {
  const { diffs, done, onSelect, projectId, projects, tabsByProject, workspaceId } = props
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const toggle = (id: string) =>
    setCollapsed((state) => {
      const next = new Set(state)
      if (!next.delete(id)) next.add(id)
      return next
    })

  return (
    <nav className="side" aria-label="Projects" style={{ width: props.width }}>
      {/* The window's traffic lights sit on the left of this row; the row drags the window. */}
      <div className="side-top" data-tauri-drag-region>
        <button
          type="button"
          className="icon-btn"
          aria-label="Hide the sidebar (⌘B)"
          title="Hide the sidebar (⌘B)"
          onClick={props.onHide}
        >
          <Icon name="panelLeft" />
        </button>
      </div>
      <div className="side-nav">
        <button
          type="button"
          className={props.page === 'stats' ? 'nav is-on' : 'nav'}
          aria-pressed={props.page === 'stats'}
          onClick={props.onStats}
        >
          <Icon name="chart" />
          Stats
        </button>
        <button type="button" className="nav" onClick={props.onNewProject}>
          <Icon name="plus" />
          New project
        </button>
        <button type="button" className="nav" onClick={props.onProjects}>
          <Icon name="search" />
          <span className="grow">Search</span>
          <span className="kbd">⌘P</span>
        </button>
      </div>
      <div className="side-label">Projects</div>
      <div className="tree">
        {projects.map((project) => {
          const open = !collapsed.has(project.id)
          const list = props.workspaces[project.id] ?? []
          const tabs = tabsByProject[project.id] ?? []
          return (
            <div className="project" key={project.id}>
              <div className="project-row">
                <button
                  type="button"
                  className="project-name"
                  aria-expanded={open}
                  title={project.projectPath}
                  onClick={() => toggle(project.id)}
                >
                  <ProjectAvatar name={project.name} />
                  <span className="grow">{project.name}</span>
                  <span className={open ? 'chev is-open' : 'chev'}>
                    <Icon name="chevron" small />
                  </span>
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`New workspace in ${project.name}`}
                  title="New workspace"
                  onClick={() => props.onNewWorkspace(project.id)}
                >
                  <Icon name="plus" />
                </button>
              </div>
              {open &&
                list.map((ws) => {
                  const active = project.id === projectId && ws.id === workspaceId
                  const signal = active ? null : signalOf(tabsOf(tabs, ws, list), done)
                  const diff = ws.path === undefined ? undefined : diffs[ws.path]
                  return (
                    <button
                      type="button"
                      key={ws.id ?? 'root'}
                      className={active ? 'ws is-active' : 'ws'}
                      aria-current={active}
                      title={ws.branch === undefined ? ws.path : `${ws.branch} · ${ws.path}`}
                      onClick={() => onSelect(project.id, ws.id)}
                    >
                      <Icon name="branch" small />
                      <span className="ws-name">{ws.name}</span>
                      {signal && <StatusDot signal={signal} />}
                      {diff && diff.add + diff.del > 0 && (
                        <span className="ws-diff">
                          <span className="add">+{diff.add}</span>{' '}
                          <span className="del">−{diff.del}</span>
                        </span>
                      )}
                    </button>
                  )
                })}
            </div>
          )
        })}
      </div>
      <div className="side-foot">
        {props.foot}
        <span className="grow" />
        {/* Said only when it is not the case. */}
        {!props.connected && (
          <span
            className="st st-waiting"
            role="img"
            aria-label="Reconnecting to the daemon"
            title="Reconnecting…"
          />
        )}
        <button
          type="button"
          className={props.page === 'settings' ? 'icon-btn is-on' : 'icon-btn'}
          aria-label="Settings"
          aria-pressed={props.page === 'settings'}
          title="Settings"
          onClick={props.onSettings}
        >
          <Icon name="gear" />
        </button>
      </div>
    </nav>
  )
}
