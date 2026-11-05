import type { TabSessionSummary } from '@aimux/ipc'

import { useState } from 'react'

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
  onSelect: (projectId: string, workspaceId: string | null) => void
  onProjects: () => void
  onNewProject: () => void
  onNewWorkspace: (projectId: string) => void
  onStats: () => void
  onSettings: () => void
}

const plural = (n: number) => `${n} ${n === 1 ? 'tab' : 'tabs'}`

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
    <nav className="side" aria-label="Projects">
      {/* The window's traffic lights sit here: the strip drags the window. */}
      <div className="titlebar" data-tauri-drag-region />
      <div className="side-head">
        <span className="side-title">Projects</span>
        <span className="side-actions">
          <button
            type="button"
            className="icon-btn"
            aria-label="Find a project"
            onClick={props.onProjects}
          >
            <Icon name="search" />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Open a folder as a project"
            onClick={props.onNewProject}
          >
            <Icon name="plus" />
          </button>
        </span>
      </div>
      <div className="tree">
        {projects.map((project) => {
          const open = !collapsed.has(project.id)
          const list = props.workspaces[project.id] ?? []
          const tabs = tabsByProject[project.id] ?? []
          return (
            <div className="project" key={project.id}>
              <div className="project-row-wrap">
                <button
                  type="button"
                  className={open ? 'project-row is-open' : 'project-row'}
                  aria-expanded={open}
                  onClick={() => toggle(project.id)}
                >
                  <span className="chev">
                    <Icon name="chevron" small />
                  </span>
                  <span className="grow">{project.name}</span>
                  <span className="tabs-count">{plural(tabs.length)}</span>
                </button>
                <button
                  type="button"
                  className="icon-btn row-add"
                  aria-label={`New workspace in ${project.name}`}
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
                      onClick={() => onSelect(project.id, ws.id)}
                    >
                      <span className="ws-line">
                        <span className="ws-name">{ws.name}</span>
                        {diff && diff.add + diff.del > 0 && (
                          <span className="ws-diff">
                            <span className="add">+{diff.add}</span>{' '}
                            <span className="del">−{diff.del}</span>
                          </span>
                        )}
                        {signal && <StatusDot signal={signal} />}
                      </span>
                      {ws.branch !== undefined && (
                        <span className="ws-branch">
                          <Icon name="branch" small />
                          <span>{ws.branch}</span>
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
        <button type="button" className="ghost" onClick={props.onSettings}>
          <Icon name="sliders" />
          Settings
        </button>
        <button type="button" className="ghost" onClick={props.onStats}>
          <Icon name="chart" />
          Stats
        </button>
      </div>
    </nav>
  )
}
