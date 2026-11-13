import { openUrl } from '@tauri-apps/plugin-opener'
import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react'

import { Dialog, DialogContent } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

import {
  ACTION_LABEL,
  actionRequest,
  actionsFor,
  authUrl,
  type McpAction,
  type McpRequest,
  type McpServer,
  parseMcpStatus,
  STATE_LABEL,
} from '../chat/mcp'
import { BrailleSpinner } from './braille-spinner'
import { useLoaderChoice } from './loader-choice'
import { Hint } from './picker'
import { pointerMoved } from './pointer'
import { Dot, type Tone } from './status-dot'

const TONE: Record<McpServer['state'], Tone> = {
  'connected': 'done',
  'disabled': 'idle',
  'failed': 'failing',
  'needs-auth': 'waiting',
  'pending': 'working',
}

/** How often a sign-in in the browser is checked on, and for how long. */
const AUTH_POLL = 2000
const AUTH_WAIT = 5 * 60_000

interface Props {
  /** Sends one control request to the chat's Claude; rejects with what went wrong. */
  request: (request: McpRequest) => Promise<Record<string, unknown>>
  onClose: () => void
}

/** `/mcp`: the chat's MCP servers, their state, and what can be done to each. */
export function McpPanel({ onClose, request }: Props) {
  const [servers, setServers] = useState<McpServer[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Rows with an action in flight, and what it is. */
  const [busy, setBusy] = useState<Record<string, McpAction>>({})
  const [rowError, setRowError] = useState<Record<string, string>>({})
  const [hot, setHot] = useState(0)
  const [act, setAct] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const open = useRef(true)
  const loaders = useLoaderChoice()
  // The parent hands a new function each render; the list is asked for once.
  const ask = useRef(request)
  ask.current = request

  const refresh = useCallback(async () => {
    const answer = await ask.current({ subtype: 'mcp_status' })
    const list = parseMcpStatus(answer)
    if (!open.current) return null
    if (list === null) throw new Error('Claude Code sent no server list.')
    setServers(list)
    setError(null)
    return list
  }, [])

  useEffect(() => {
    open.current = true
    refresh().catch((error_: unknown) => setError(message(error_)))
    return () => {
      open.current = false
    }
  }, [refresh])

  useEffect(() => setAct(0), [hot])
  useEffect(() => {
    root.current
      ?.querySelector('[role=option][aria-selected=true]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [hot])

  /** Signed in once the server leaves `needs-auth`; the browser does the rest. */
  const awaitSignIn = async (name: string) => {
    const until = Date.now() + AUTH_WAIT
    while (open.current && Date.now() < until) {
      await new Promise((r) => setTimeout(r, AUTH_POLL))
      const list = await refresh().catch(() => null)
      const s = list?.find((x) => x.name === name)
      if (s && s.state !== 'needs-auth') return
    }
  }

  const run = async (server: McpServer, action: McpAction) => {
    if (busy[server.name] !== undefined) return
    setBusy((b) => ({ ...b, [server.name]: action }))
    setRowError((e) => without(e, server.name))
    try {
      const answer = await ask.current(actionRequest(action, server.name))
      const url = action === 'authenticate' ? authUrl(answer) : null
      if (url !== null) {
        await openUrl(url).catch(() => {})
        await awaitSignIn(server.name)
      } else await refresh()
    } catch (error_) {
      if (open.current) setRowError((e) => ({ ...e, [server.name]: message(error_) }))
    } finally {
      if (open.current) setBusy((b) => without(b, server.name))
    }
  }

  const list = servers ?? []
  const onKeyDown = (e: KeyboardEvent) => {
    const server = list[hot]
    const actions = server ? actionsFor(server) : []
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const step = e.key === 'ArrowDown' ? 1 : -1
      setHot((i) => (i + step + list.length) % Math.max(list.length, 1))
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      const step = e.key === 'ArrowRight' ? 1 : -1
      setAct((i) => (i + step + actions.length) % Math.max(actions.length, 1))
    } else if (e.key === 'Enter' && server && actions[act]) {
      e.preventDefault()
      void run(server, actions[act])
    }
  }

  let note: string | null = null
  if (error !== null) note = error
  else if (servers === null) note = 'Asking Claude Code for its servers…'
  else if (servers.length === 0)
    note = 'No MCP servers for this chat. Add one with claude mcp add, then reopen /mcp.'

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        aria-label="MCP servers"
        initialFocus={() => root.current ?? true}
        overlayClassName="bg-transparent"
        className="shadow-popover data-open:slide-in-from-top-[4px]! data-open:zoom-in-[0.98] top-[18vh] w-[min(640px,calc(100%-32px))] border-0 data-open:duration-160"
      >
        <div ref={root} tabIndex={-1} className="flex flex-col outline-none" onKeyDown={onKeyDown}>
          <div className="border-border flex h-12 items-center border-b px-4">
            <span className="text-base font-semibold">MCP servers</span>
            {servers !== null && servers.length > 0 && (
              <span className="text-faint ml-2 text-xs tabular-nums">{servers.length}</span>
            )}
          </div>
          <div className="max-h-[360px] overflow-auto p-1.5" role="listbox">
            {list.map((s, i) => (
              <Row
                key={s.name}
                server={s}
                hot={i === hot}
                act={i === hot ? act : -1}
                busy={busy[s.name]}
                error={rowError[s.name] ?? null}
                loader={loaders.working}
                onHover={() => setHot(i)}
                onRun={(action) => void run(s, action)}
              />
            ))}
            {note !== null && (
              <div
                className={cn(
                  'flex h-12 items-center gap-2 px-2.5 text-sm',
                  error === null ? 'text-faint' : 'text-critical-ink'
                )}
              >
                {servers === null && error === null && (
                  <BrailleSpinner loader={loaders.working} className="text-faint" />
                )}
                {note}
              </div>
            )}
          </div>
          <div className="border-border bg-chrome text-faint flex h-9 items-center gap-4 border-t px-4 text-xs">
            <Hint keys="↵">run</Hint>
            <Hint keys="↑↓">server</Hint>
            <Hint keys="←→">action</Hint>
            <Hint keys="esc">close</Hint>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface RowProps {
  server: McpServer
  hot: boolean
  /** The action the keyboard is on, -1 off the hot row. */
  act: number
  busy: McpAction | undefined
  error: string | null
  loader: Parameters<typeof BrailleSpinner>[0]['loader']
  onHover: () => void
  onRun: (action: McpAction) => void
}

function Row({ act, busy, error, hot, loader, onHover, onRun, server }: RowProps) {
  const detail = error ?? (server.state === 'failed' ? server.error : null)
  const meta = [
    STATE_LABEL[server.state],
    server.tools !== null && server.state === 'connected' && `${server.tools} tools`,
    server.scope,
  ]
    .filter(Boolean)
    .join(' · ')
  let busyLabel = busy === undefined ? null : `${ACTION_LABEL[busy]}…`
  if (busy === 'authenticate') busyLabel = 'Finish signing in, in your browser…'
  return (
    <div
      role="option"
      aria-selected={hot}
      className={cn(
        'flex min-h-12 w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 transition-colors duration-120',
        hot && 'bg-accent'
      )}
      onMouseMove={(e) => pointerMoved(e) && onHover()}
    >
      <span className="grid size-4 flex-none place-items-center">
        <Dot tone={TONE[server.state]} label={STATE_LABEL[server.state]} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-foreground truncate text-base" title={server.name}>
          {server.name}
        </span>
        <span
          className={cn('truncate text-xs', detail === null ? 'text-faint' : 'text-critical-ink')}
          title={detail ?? meta}
        >
          {detail ?? meta}
        </span>
      </span>
      {busyLabel === null ? (
        <span className="flex flex-none items-center gap-1">
          {actionsFor(server).map((action, i) => (
            <button
              key={action}
              type="button"
              tabIndex={-1}
              className={cn(
                'text-muted-foreground hover:bg-background hover:text-foreground h-7 rounded-md px-2 text-sm transition-colors duration-120',
                i === act && 'bg-background text-foreground shadow-[0_0_0_1px_var(--line-strong)]',
                action === 'sign-out' && 'hover:text-critical-ink'
              )}
              onClick={() => onRun(action)}
            >
              {ACTION_LABEL[action]}
            </button>
          ))}
        </span>
      ) : (
        <span className="text-faint animate-in fade-in flex h-7 flex-none items-center gap-2 text-sm duration-160">
          <BrailleSpinner loader={loader} />
          {busyLabel}
        </span>
      )}
    </div>
  )
}

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record }
  delete next[key]
  return next
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))
