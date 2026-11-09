import {
  ChevronRightIcon,
  EllipsisIcon,
  FolderOpenIcon,
  InboxIcon,
  PanelLeftIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
} from 'lucide-react'
import { type MouseEvent, type ReactNode, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

import type { Project, Signal, Workspace } from '../model/catalog'

import { StatusDot } from './status-dot'
import { RenameField } from './tab-bar'

export interface DiffStat {
  add: number
  del: number
}

/** What a right-click (or a row's ··· button) asks a menu for. */
export type RowMenu =
  | { kind: 'project'; project: Project; x: number; y: number }
  | { kind: 'workspace'; project: Project; workspace: Workspace; x: number; y: number }

/** What the rows read of a chat: a `ChatRecord`, `activeAt` once it is kept. */
export interface ChatFacts {
  workspaceId: string
  title: string
  createdAt: number
  /** When a turn last started or ended (ms); 0 or absent before it was recorded. */
  activeAt?: number
}

interface Props {
  projects: Project[]
  workspaces: Record<string, Workspace[]>
  /** What each workspace's tabs call attention to. */
  signals: Record<string, Signal | null>
  diffs: Record<string, DiffStat>
  /** Every chat: a workspace's age and task title come from them. */
  chats?: readonly ChatFacts[]
  projectId: string | null
  workspaceId: string | null
  page: 'settings' | null
  onSelect: (projectId: string, workspaceId: string | null) => void
  onProjects: () => void
  onNewProject: () => void
  onNewWorkspace: (projectId: string) => void
  onMenu: (menu: RowMenu) => void
  /** The workspace whose name is being edited in place. */
  renamingId: string | null
  onRename: (workspace: Workspace) => void
  /** A new name ('' gives the colour back), or null when renaming was dropped. */
  onRenamed: (workspace: Workspace, name: string | null) => void
  /** How many agents wait for an answer, and how many finished, in every project. */
  inbox: { waiting: number; done: number }
  onInbox: (at: { x: number; y: number }) => void
  onSettings: () => void
  onHide: () => void
  /** Pixels once dragged, or a CSS width that follows the window. */
  width: number | string
  /** Quotas, at the left of the foot. */
  foot: ReactNode
  /** Floats just above the foot: the attention toast. */
  dock?: ReactNode
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

/** How long ago, as the sidebar says it: "now", "4m", "3h", "2d", "5w". */
export function ageLabel(at: number, now: number): string {
  const minutes = Math.floor((now - at) / 60_000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return days < 7 ? `${days}d` : `${Math.floor(days / 7)}w`
}

/**
 * A workspace's last activity (the latest turn of its chats, else when they or it were
 * created) and its task: the first chat's title that isn't "New chat" (a first prompt names
 * its chat), or null.
 */
export function workspaceFacts(
  ws: Pick<Workspace, 'id' | 'createdAt'>,
  chats: readonly ChatFacts[]
): { activeAt: number; task: string | null } {
  const own = chats
    .filter((c) => c.workspaceId === ws.id)
    .toSorted((a, b) => a.createdAt - b.createdAt)
  let activeAt = ws.createdAt
  for (const c of own) activeAt = Math.max(activeAt, c.activeAt ?? 0, c.createdAt)
  const task = own.find((c) => c.title.trim() !== '' && c.title !== 'New chat')?.title ?? null
  return { activeAt, task }
}

/** The colour word of a workspace's branch (`aimux/amber` → amber). */
const colourWord = (branch: string) => branch.slice(branch.lastIndexOf('/') + 1)

/** Ages move on by the minute. */
function useNow(): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])
  return now
}

const NAV =
  'hover:bg-hover text-muted-foreground flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm whitespace-nowrap transition-[background-color] duration-120'
const BADGE =
  'bg-active text-muted-foreground h-[18px] min-w-[18px] rounded-full px-[5px] text-center text-2xs leading-[18px] tabular-nums'
/** A section label: "Projects", and each project's name. */
const LABEL = 'text-label text-xs font-medium'
/** The hover tools over a row's end: they fade in over a gradient of the row's own fill. */
const HOVER_TOOLS =
  'pointer-events-none absolute right-1 flex items-center bg-linear-to-r from-transparent to-(--row) to-30% pl-6 opacity-0 transition-opacity duration-120 group-focus-within/row:pointer-events-auto group-focus-within/row:opacity-100 group-hover/row:pointer-events-auto group-hover/row:opacity-100'

/** Where a menu opens: at the pointer for a right-click, under the button for a click. */
function at(e: MouseEvent) {
  if (e.type === 'contextmenu') return { x: e.clientX, y: e.clientY }
  const box = e.currentTarget.getBoundingClientRect()
  return { x: box.left, y: box.bottom + 4 }
}

const FOLDED_KEY = 'aimux.sidebar.folded'

/** The projects folded last time: a per-window convenience, empty when storage is refused. */
function loadFolded(): ReadonlySet<string> {
  try {
    const raw = localStorage.getItem(FOLDED_KEY)
    const ids: unknown = raw === null ? [] : JSON.parse(raw)
    return new Set(Array.isArray(ids) ? ids.filter((x) => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

function saveFolded(ids: ReadonlySet<string>) {
  try {
    localStorage.setItem(FOLDED_KEY, JSON.stringify([...ids]))
  } catch {
    // nothing to do: the next launch shows every project open
  }
}

export function Sidebar(props: Props) {
  const { onMenu, projectId, projects, workspaceId } = props
  const now = useNow()
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(loadFolded)
  const toggle = (id: string) =>
    setCollapsed((state) => {
      const next = new Set(state)
      if (!next.delete(id)) next.add(id)
      saveFolded(next)
      return next
    })
  // ⌘1–9 go through every workspace in sidebar order, folded groups included.
  const order = projects.flatMap((p) => (props.workspaces[p.id] ?? []).map((w) => w.id))

  return (
    <nav
      className="bg-side @container flex min-h-0 flex-none flex-col"
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
          data-tip="New workspace · ⌘N"
          onClick={() => projectId !== null && props.onNewWorkspace(projectId)}
        >
          <PlusIcon className="text-faint size-4 shrink-0" />
          <span className="min-w-0 flex-1 text-left">New workspace</span>
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
          <span className="min-w-0 flex-1 text-left">Inbox</span>
          {props.inbox.waiting > 0 && (
            <span
              data-tip={`${props.inbox.waiting} waiting`}
              className={cn(
                BADGE,
                'bg-[color-mix(in_srgb,var(--warn)_22%,var(--background))] text-warn-ink'
              )}
            >
              {props.inbox.waiting}
            </span>
          )}
          {props.inbox.done > 0 && (
            <span className={BADGE} data-tip={`${props.inbox.done} done`}>
              {props.inbox.done}
            </span>
          )}
        </button>
        <button type="button" className={NAV} data-tip="Search · ⌘P" onClick={props.onProjects}>
          <SearchIcon className="text-faint size-4 shrink-0" />
          <span className="min-w-0 flex-1 text-left">Search</span>
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-1.5 pb-3">
        {/* ⌘O and ⌘P's Projects add one; with none yet, this row says how. */}
        {projects.length === 0 && (
          <button type="button" className={cn(NAV, 'mt-2 w-full')} onClick={props.onNewProject}>
            <FolderOpenIcon className="text-faint size-4 shrink-0" />
            Open a folder…
          </button>
        )}
        {projects.map((project, p) => {
          const open = !collapsed.has(project.id)
          const list = props.workspaces[project.id] ?? []
          // With no workspace to select, the project itself is where you are (not in Settings).
          const here = project.id === projectId && workspaceId === null && props.page === null
          return (
            <section key={project.id} aria-label={project.name}>
              <div
                className={cn(
                  'group/row relative flex h-7 items-center rounded-md [--row:var(--sidebar)]',
                  p === 0 ? 'mt-2' : 'mt-4',
                  here && 'bg-active [--row:var(--active)]'
                )}
                aria-current={here || undefined}
                onContextMenu={(e) => {
                  e.preventDefault()
                  onMenu({ kind: 'project', project, ...at(e) })
                }}
              >
                <button
                  type="button"
                  className={cn(
                    LABEL,
                    'hover:text-faint flex h-full min-w-0 flex-1 items-center gap-1 px-3 transition-[color] duration-120'
                  )}
                  aria-expanded={open}
                  onClick={() => toggle(project.id)}
                >
                  <span className="min-w-0 flex-[0_1_auto] truncate">{project.name}</span>
                  <ChevronRightIcon
                    className={cn(
                      'size-3.5 opacity-0 transition-[opacity,rotate] duration-[120ms,150ms] ease-[ease,cubic-bezier(0.2,0,0,1)] group-hover/row:opacity-100',
                      open && 'rotate-90'
                    )}
                  />
                </button>
                {/* Over the name's end on hover or focus, on a fade: at rest the name has the
                    whole row. */}
                <span className={cn(HOVER_TOOLS, 'inset-y-0')}>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`More for ${project.name}`}
                    onClick={(e) => onMenu({ kind: 'project', project, ...at(e) })}
                  >
                    <EllipsisIcon className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`New workspace in ${project.name}`}
                    onClick={() => props.onNewWorkspace(project.id)}
                  >
                    <PlusIcon className="size-4" />
                  </Button>
                </span>
              </div>
              {/* Folding slides the group's height; the rows inside don't reflow. */}
              <div
                className={cn(
                  'grid transition-[grid-template-rows,opacity] duration-180 ease-in-out motion-reduce:transition-[opacity]',
                  open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr] opacity-0'
                )}
                inert={!open}
              >
                <div className="flex min-h-0 flex-col gap-0.5 overflow-hidden pt-0.5">
                  {list.length === 0 && (
                    <button
                      type="button"
                      className="text-label hover:bg-hover hover:text-muted-foreground flex h-8 items-center gap-2 rounded-md pl-3 text-sm transition-[background-color,color] duration-120"
                      onClick={() => props.onNewWorkspace(project.id)}
                    >
                      <PlusIcon className="size-3.5 flex-none" />
                      New workspace
                    </button>
                  )}
                  {list.map((ws) => (
                    <WorkspaceRow
                      key={ws.id}
                      {...props}
                      ws={ws}
                      project={project}
                      number={order.indexOf(ws.id)}
                      now={now}
                    />
                  ))}
                </div>
              </div>
            </section>
          )
        })}
      </div>
      <div className="border-border relative flex h-bar flex-none items-center gap-1.5 border-t pr-2 pl-2.5">
        {props.dock}
        {props.foot}
        <span className="min-w-0 flex-1" />
        <Button
          variant="ghost"
          size="icon"
          className={cn(props.page === 'settings' && 'bg-active text-foreground hover:bg-active')}
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

/** How long after a row first draws its signal counts as found rather than new. */
const SETTLE_MS = 1500

/**
 * The aimux TUI's row tint: a workspace that finished or waits for you lights up once in its
 * colour, then keeps a faint wash from the left edge while it stays so. `flash` is read when
 * the tint appears: a row already finished or waiting when the sidebar drew it doesn't flash.
 */
function RowTint({ flash, signal }: { signal: 'done' | 'waiting'; flash: boolean }) {
  const [play] = useState(flash)
  return (
    <span
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-0 -z-10 rounded-md opacity-30',
        'bg-[linear-gradient(90deg,color-mix(in_srgb,var(--tone)_40%,transparent),transparent_60%)]',
        signal === 'done' ? '[--tone:var(--good)]' : '[--tone:var(--warn)]',
        play && 'animate-[tint_0.7s_cubic-bezier(0.2,0,0,1)]'
      )}
    />
  )
}

/**
 * A workspace: what its agent is doing (the working loader, the waiting dot, the done dot
 * while unread, nothing while idle) over its tint, its task (the first chat's title; a name the user chose
 * outranks it, and with neither, the colour word), bold while a finished turn is unread; at
 * the right its colour word and age. On hover, its menu button and, in a tooltip, its diff,
 * branch and ⌘ number.
 */
function WorkspaceRow(
  props: Props & { ws: Workspace; project: Project; number: number; now: number }
) {
  const { now, number, project, ws } = props
  // Settings on screen: no row is where you are.
  const active =
    project.id === props.projectId && ws.id === props.workspaceId && props.page === null
  // Working and waiting show on the row you are on too; what it finished, you are reading.
  const reported = props.signals[ws.id] ?? null
  const signal = active && reported === 'done' ? null : reported
  const unread = signal === 'done'
  // The signals settle while the chats load and replay: what a row shows then, it shows
  // without a flash. A tint that comes after has news to tell.
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(true), SETTLE_MS)
    return () => clearTimeout(timer)
  }, [])
  const diff = props.diffs[ws.path]
  const facts = workspaceFacts(ws, props.chats ?? [])
  const renaming = ws.id === props.renamingId
  const word = colourWord(ws.branch)
  const title = ws.name === word ? (facts.task ?? ws.name) : ws.name

  const menu = (e: MouseEvent) => {
    e.preventDefault()
    props.onMenu({ kind: 'workspace', project, workspace: ws, ...at(e) })
  }
  const status = ageLabel(facts.activeAt, now)
  // Keyed by the signal, so a change cross-fades in place.
  const icon = (
    <span
      key={signal ?? 'idle'}
      className="animate-in fade-in flex size-3.5 flex-none items-center justify-center duration-160 ease-out"
    >
      {signal !== null && <StatusDot signal={signal} />}
    </span>
  )
  const tip = [
    diff && diff.add + diff.del > 0 ? `+${diff.add} −${diff.del}` : null,
    ws.branch,
  ].filter((part) => part !== null)
  const row = 'flex h-9 w-full items-center gap-2 pr-2 pl-2.5'

  return (
    <div
      className={cn(
        'group/row text-muted-foreground relative isolate rounded-md text-sm transition-[background-color] duration-120 [--row:var(--sidebar)]',
        active ? 'bg-active [--row:var(--active)]' : 'hover:bg-hover hover:[--row:var(--hover)]'
      )}
      onContextMenu={menu}
    >
      {(signal === 'done' || signal === 'waiting') && (
        <RowTint key={signal} signal={signal} flash={settled} />
      )}
      {renaming ? (
        // In place of the row's button: a field inside a button would click it.
        <div className={row}>
          {icon}
          <RenameField
            className="-ml-0.5 pl-0.5 text-sm"
            label="Workspace name"
            value={ws.name}
            onDone={(name) => props.onRenamed(ws, name)}
          />
        </div>
      ) : (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                className={row}
                aria-current={active}
                data-workspace={ws.id}
                onClick={() => props.onSelect(project.id, ws.id)}
                onDoubleClick={() => props.onRename(ws)}
              />
            }
          >
            {icon}
            <span
              className={cn(
                'min-w-0 flex-1 truncate text-left',
                active && 'text-foreground font-medium',
                !active && unread && 'text-foreground font-semibold'
              )}
            >
              {title}
            </span>
            <span className="text-faint flex flex-none items-center gap-1 text-xs tabular-nums">
              {/* Below 240px of sidebar the task keeps the room; the tooltip has the branch. */}
              {title !== word && (
                <span className="flex items-center gap-1 @max-[240px]:hidden">
                  <span>{word}</span>
                  <span aria-hidden="true">·</span>
                </span>
              )}
              {status}
            </span>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            <span className="font-mono">{tip.join(' · ')}</span>
            {number >= 0 && number < 9 && <Kbd className="text-white/60">⌘{number + 1}</Kbd>}
          </TooltipContent>
        </Tooltip>
      )}
      {!renaming && (
        <span className={cn(HOVER_TOOLS, 'top-0 h-9')}>
          <Button variant="ghost" size="icon-sm" aria-label={`More for ${ws.name}`} onClick={menu}>
            <EllipsisIcon className="size-4" />
          </Button>
        </span>
      )}
    </div>
  )
}
