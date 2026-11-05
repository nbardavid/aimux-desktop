import { type MouseEvent, type ReactNode, useState } from 'react'

import type { Project, Signal, Workspace } from '../model/catalog'

import { Icon } from './icons'
import { StatusDot } from './status-dot'

export interface DiffStat {
  add: number
  del: number
}

/** What a right-click (or a row's ··· button) asks a menu for. */
export type RowMenu =
  | { kind: 'project'; project: Project; x: number; y: number }
  | { kind: 'workspace'; project: Project; workspace: Workspace; x: number; y: number }

interface Props {
  projects: Project[]
  workspaces: Record<string, Workspace[]>
  /** What each workspace's tabs call attention to. */
  signals: Record<string, Signal | null>
  diffs: Record<string, DiffStat>
  projectId: string | null
  workspaceId: string | null
  page: 'settings' | null
  onSelect: (projectId: string, workspaceId: string | null) => void
  onProjects: () => void
  onNewProject: () => void
  onNewWorkspace: (projectId: string) => void
  onMenu: (menu: RowMenu) => void
  /** How many agents wait for an answer, and how many finished, in every project. */
  inbox: { waiting: number; done: number }
  onInbox: (at: { x: number; y: number }) => void
  onSettings: () => void
  onHide: () => void
  width: number
  /** Quotas, at the left of the foot. */
  foot: ReactNode
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

/** Where a menu opens: at the pointer for a right-click, under the button for a click. */
function at(e: MouseEvent) {
  if (e.type === 'contextmenu') return { x: e.clientX, y: e.clientY }
  const box = e.currentTarget.getBoundingClientRect()
  return { x: box.left, y: box.bottom + 4 }
}

export function Sidebar(props: Props) {
  const { diffs, onMenu, onSelect, projectId, projects, signals, workspaceId } = props
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
          data-tip="Hide sidebar · ⌘B"
          onClick={props.onHide}
        >
          <Icon name="panelLeft" />
        </button>
      </div>
      <div className="side-nav">
        <button
          type="button"
          className="nav"
          onClick={() => projectId !== null && props.onNewWorkspace(projectId)}
        >
          <Icon name="plus" />
          <span className="grow">New workspace</span>
          <span className="kbd">⌘N</span>
        </button>
        <button
          type="button"
          className="nav"
          onClick={(e) => {
            const box = e.currentTarget.getBoundingClientRect()
            props.onInbox({ x: box.right + 8, y: box.top })
          }}
        >
          <Icon name="inbox" />
          <span className="grow">Inbox</span>
          {props.inbox.waiting > 0 && (
            <span className="badge is-waiting">{props.inbox.waiting}</span>
          )}
          {props.inbox.done > 0 && <span className="badge">{props.inbox.done}</span>}
        </button>
        <button type="button" className="nav" onClick={props.onProjects}>
          <Icon name="search" />
          <span className="grow">Search</span>
          <span className="kbd">⌘P</span>
        </button>
      </div>
      <div className="side-label">
        <span className="grow">Projects</span>
        <button
          type="button"
          className="icon-btn"
          aria-label="Open a folder as a project"
          data-tip="Open a folder"
          onClick={props.onNewProject}
        >
          <Icon name="plus" small />
        </button>
      </div>
      <div className="tree">
        {projects.map((project) => {
          const open = !collapsed.has(project.id)
          const list = props.workspaces[project.id] ?? []
          return (
            <div className="project" key={project.id}>
              <div
                className="project-row"
                onContextMenu={(e) => {
                  e.preventDefault()
                  onMenu({ kind: 'project', project, ...at(e) })
                }}
              >
                <button
                  type="button"
                  className="project-name"
                  aria-expanded={open}
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
                  className="icon-btn row-more"
                  aria-label={`More for ${project.name}`}
                  onClick={(e) => onMenu({ kind: 'project', project, ...at(e) })}
                >
                  <Icon name="more" />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`New workspace in ${project.name}`}
                  onClick={() => props.onNewWorkspace(project.id)}
                >
                  <Icon name="plus" />
                </button>
              </div>
              {open &&
                list.map((ws) => {
                  const active = project.id === projectId && ws.id === workspaceId
                  const signal = active ? null : (signals[ws.id] ?? null)
                  const diff = diffs[ws.path]
                  const menu = (e: MouseEvent) => {
                    e.preventDefault()
                    onMenu({ kind: 'workspace', project, workspace: ws, ...at(e) })
                  }
                  return (
                    <div
                      key={ws.id}
                      className={active ? 'ws is-active' : 'ws'}
                      onContextMenu={menu}
                    >
                      <button
                        type="button"
                        className="ws-main"
                        aria-current={active}
                        onClick={() => onSelect(project.id, ws.id)}
                      >
                        <Icon name="branch" small />
                        <span className="ws-name">{ws.name}</span>
                        {signal && <StatusDot signal={signal} />}
                        {diff && diff.add + diff.del > 0 && (
                          <span className="ws-diff">
                            {diff.add > 0 && <span className="add">+{diff.add}</span>}
                            {diff.del > 0 && <span className="del">−{diff.del}</span>}
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        className="icon-btn row-more"
                        aria-label={`More for ${ws.name}`}
                        onClick={menu}
                      >
                        <Icon name="more" />
                      </button>
                    </div>
                  )
                })}
            </div>
          )
        })}
      </div>
      <div className="side-foot">
        {props.foot}
        <span className="grow" />
        <button
          type="button"
          className={props.page === 'settings' ? 'icon-btn is-on' : 'icon-btn'}
          aria-label="Settings"
          aria-pressed={props.page === 'settings'}
          data-tip="Settings"
          data-tip-side="top"
          data-tip-align="end"
          onClick={props.onSettings}
        >
          <Icon name="gear" />
        </button>
      </div>
    </nav>
  )
}
