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
  width: number
  /** Quotas and the daemon's state, under the tree. */
  foot: ReactNode
  connected: boolean
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
          aria-label="Find a project (⌘P)"
          title="Find a project (⌘P)"
          onClick={props.onProjects}
        >
          <Icon name="search" small />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Open a folder as a project"
          title="Open a folder as a project"
          onClick={props.onNewProject}
        >
          <Icon name="plus" small />
        </button>
      </div>
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
                  onClick={() => toggle(project.id)}
                >
                  <span className={open ? 'chev is-open' : 'chev'}>
                    <Icon name="chevron" small />
                  </span>
                  <span className="grow">{project.name}</span>
                </button>
                <button
                  type="button"
                  className="icon-btn row-add"
                  aria-label={`New workspace in ${project.name}`}
                  title="New workspace"
                  onClick={() => props.onNewWorkspace(project.id)}
                >
                  <Icon name="plus" small />
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
                      title={ws.path}
                      onClick={() => onSelect(project.id, ws.id)}
                    >
                      <span className="ws-line">
                        <span className="ws-name">{ws.name}</span>
                        {signal && <StatusDot signal={signal} />}
                        {diff && diff.add + diff.del > 0 && (
                          <span className="ws-diff">
                            <span className="add">+{diff.add}</span>{' '}
                            <span className="del">−{diff.del}</span>
                          </span>
                        )}
                      </span>
                      {ws.branch !== undefined && <span className="ws-branch">{ws.branch}</span>}
                    </button>
                  )
                })}
            </div>
          )
        })}
      </div>
      {props.foot}
      <div className="side-foot">
        <button
          type="button"
          className={props.page === 'settings' ? 'foot-btn is-on' : 'foot-btn'}
          aria-pressed={props.page === 'settings'}
          onClick={props.onSettings}
        >
          <Icon name="sliders" small />
          Settings
        </button>
        <button
          type="button"
          className={props.page === 'stats' ? 'foot-btn is-on' : 'foot-btn'}
          aria-pressed={props.page === 'stats'}
          onClick={props.onStats}
        >
          <Icon name="chart" small />
          Stats
        </button>
        <span
          className={props.connected ? 'st st-done daemon' : 'st st-waiting daemon'}
          role="img"
          aria-label={props.connected ? 'Connected to the daemon' : 'Reconnecting to the daemon'}
          title={props.connected ? 'Connected to the daemon' : 'Reconnecting…'}
        />
      </div>
    </nav>
  )
}
