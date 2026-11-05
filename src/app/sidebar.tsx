import {
  ChevronRightIcon,
  EllipsisIcon,
  GitBranchIcon,
  InboxIcon,
  PanelLeftIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
} from 'lucide-react'
import { type MouseEvent, type ReactNode, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { cn } from '@/lib/utils'

import type { Project, Signal, Workspace } from '../model/catalog'

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
export function ProjectAvatar({ className, name }: { className?: string; name: string }) {
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return (
    <span
      className={cn(
        'grid size-[18px] flex-none place-items-center rounded-[5px] text-[10.5px] font-bold text-white shadow-[inset_0_0_0_1px_rgb(0_0_0/0.08)]',
        className
      )}
      style={{ background: AVATAR_TONES[hash % AVATAR_TONES.length] }}
      aria-hidden="true"
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  )
}

const NAV =
  'hover:bg-hover text-muted-foreground flex h-8 items-center gap-2.5 rounded-[8px] px-2.5 text-[13.5px] whitespace-nowrap transition-[background-color] duration-120'
const BADGE =
  'bg-active text-muted-foreground h-[18px] min-w-[18px] rounded-full px-[5px] text-center text-[11px] leading-[18px] font-semibold tabular-nums'

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
    <nav
      className="bg-side flex min-h-0 flex-none flex-col"
      aria-label="Projects"
      style={{ width: props.width }}
    >
      {/* The window's traffic lights sit on the left of this row; the row drags the window. */}
      <div className="flex h-bar flex-none items-center pl-20" data-tauri-drag-region>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Hide the sidebar (⌘B)"
          data-tip="Hide sidebar · ⌘B"
          onClick={props.onHide}
        >
          <PanelLeftIcon className="size-4" />
        </Button>
      </div>
      <div className="border-border flex flex-none flex-col border-b px-1.5 pt-1 pb-2">
        <button
          type="button"
          className={NAV}
          onClick={() => projectId !== null && props.onNewWorkspace(projectId)}
        >
          <PlusIcon className="text-faint size-4 shrink-0" />
          <span className="min-w-0 flex-1">New workspace</span>
          <Kbd className="h-[18px]">⌘N</Kbd>
        </button>
        <button
          type="button"
          className={NAV}
          onClick={(e) => {
            const box = e.currentTarget.getBoundingClientRect()
            props.onInbox({ x: box.right + 8, y: box.top })
          }}
        >
          <InboxIcon className="text-faint size-4 shrink-0" />
          <span className="min-w-0 flex-1">Inbox</span>
          {props.inbox.waiting > 0 && (
            <span
              className={cn(
                BADGE,
                'bg-[color-mix(in_srgb,var(--warn)_22%,var(--background))] text-[#7a5a08]'
              )}
            >
              {props.inbox.waiting}
            </span>
          )}
          {props.inbox.done > 0 && <span className={BADGE}>{props.inbox.done}</span>}
        </button>
        <button type="button" className={NAV} onClick={props.onProjects}>
          <SearchIcon className="text-faint size-4 shrink-0" />
          <span className="min-w-0 flex-1">Search</span>
          <Kbd className="h-[18px]">⌘P</Kbd>
        </button>
      </div>
      <div className="text-label flex flex-none items-center pt-2.5 pr-2.5 pb-0.5 pl-4 text-[12.5px] font-medium">
        <span className="min-w-0 flex-1">Projects</span>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open a folder as a project"
          data-tip="Open a folder"
          onClick={props.onNewProject}
        >
          <PlusIcon className="size-3.5" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-1.5 pb-3">
        {projects.map((project) => {
          const open = !collapsed.has(project.id)
          const list = props.workspaces[project.id] ?? []
          return (
            <div className="not-first:mt-1.5" key={project.id}>
              <div
                className="group/row flex h-9 items-center pr-1"
                onContextMenu={(e) => {
                  e.preventDefault()
                  onMenu({ kind: 'project', project, ...at(e) })
                }}
              >
                <button
                  type="button"
                  className="flex h-full min-w-0 flex-1 items-center gap-2.5 px-2.5 text-[13.5px] font-semibold"
                  aria-expanded={open}
                  onClick={() => toggle(project.id)}
                >
                  <ProjectAvatar name={project.name} />
                  <span className="min-w-0 flex-[0_1_auto] truncate">{project.name}</span>
                  <span
                    className={cn(
                      'text-label grid opacity-0 transition-[opacity,rotate] duration-[120ms,150ms] ease-[ease,cubic-bezier(0.2,0,0,1)] group-hover/row:opacity-100',
                      open && 'rotate-90'
                    )}
                  >
                    <ChevronRightIcon className="size-3.5" />
                  </span>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
                  aria-label={`More for ${project.name}`}
                  onClick={(e) => onMenu({ kind: 'project', project, ...at(e) })}
                >
                  <EllipsisIcon className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`New workspace in ${project.name}`}
                  onClick={() => props.onNewWorkspace(project.id)}
                >
                  <PlusIcon className="size-4" />
                </Button>
              </div>
              {open &&
                list.map((ws, i) => {
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
                      className={cn(
                        'group/ws text-muted-foreground hover:bg-hover flex h-[34px] w-full items-center rounded-[8px] pr-1 text-[13.5px] transition-[background-color] duration-120',
                        i > 0 && 'mt-0.5',
                        active && 'bg-active hover:bg-active text-foreground'
                      )}
                      onContextMenu={menu}
                    >
                      <button
                        type="button"
                        className="flex h-full min-w-0 flex-1 items-center gap-2.5 pr-1.5 pl-6"
                        aria-current={active}
                        onClick={() => onSelect(project.id, ws.id)}
                      >
                        <GitBranchIcon className="text-faint size-3.5 shrink-0" />
                        <span className="min-w-0 flex-1 truncate">{ws.name}</span>
                        {signal && <StatusDot signal={signal} />}
                        {diff && diff.add + diff.del > 0 && (
                          <span className="inline-flex gap-1 font-mono text-[10.5px] whitespace-nowrap tabular-nums">
                            {diff.add > 0 && <span className="text-good">+{diff.add}</span>}
                            {diff.del > 0 && <span className="text-critical">−{diff.del}</span>}
                          </span>
                        )}
                      </button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6 opacity-0 group-hover/ws:opacity-100 focus-visible:opacity-100"
                        aria-label={`More for ${ws.name}`}
                        onClick={menu}
                      >
                        <EllipsisIcon className="size-4" />
                      </Button>
                    </div>
                  )
                })}
            </div>
          )
        })}
      </div>
      <div className="border-border flex h-11 flex-none items-center gap-1.5 border-t pr-2 pl-2.5">
        {props.foot}
        <span className="min-w-0 flex-1" />
        <Button
          variant="ghost"
          size="icon"
          className={cn(props.page === 'settings' && 'text-foreground')}
          aria-label="Settings"
          aria-pressed={props.page === 'settings'}
          data-tip="Settings"
          data-tip-side="top"
          data-tip-align="end"
          onClick={props.onSettings}
        >
          <SettingsIcon className="size-4" />
        </Button>
      </div>
    </nav>
  )
}
