import { Channel, invoke } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { WebglAddon } from '@xterm/addon-webgl'
import { Terminal } from '@xterm/xterm'
import { useCallback, useMemo, useRef, useState } from 'react'

import type { HostTerm } from './use-host'

import { appShortcut } from './navigation'

export interface TerminalTab {
  id: string
  workspaceId: string
  title: string
  createdAt: number
  /** Set once the shell or the command ended: its exit code, null when it was killed. */
  exited?: number | null
  /** `setup` for a setup script's run. */
  tag?: string
}

/** What lives outside React: the emulator, its element, and the shell behind it. */
interface Live {
  term: Terminal
  fit: FitAddon
  host: HTMLDivElement
  /** Settles once the background host has the shell: input waits for it. */
  ready: Promise<unknown>
  opened: boolean
}

// Light, to sit on the window's paper; ANSI colours chosen to read on white.
const THEME = {
  background: '#ffffff',
  black: '#0b0c0f',
  blue: '#2f5fbf',
  brightBlack: '#57606a',
  brightBlue: '#3d72d8',
  brightCyan: '#25919a',
  brightGreen: '#3a9354',
  brightMagenta: '#9467e6',
  brightRed: '#d6453a',
  brightWhite: '#8c959f',
  brightYellow: '#a07a10',
  cursor: '#2b2826',
  cyan: '#1b7c83',
  foreground: '#2b2826',
  green: '#2f7d46',
  magenta: '#8250df',
  red: '#c43a2b',
  selectionBackground: '#e9dcd3',
  white: '#6e7781',
  yellow: '#8a6a0c',
}

interface Start {
  workspaceId: string
  cwd: string
  title?: string
  /** Run by the login shell instead of an interactive one: the tab stays to show how it went. */
  command?: string
  /** Kept by the host and given back on reattach: `setup` for a setup script. */
  tag?: string
  onExit?: (code: number | null) => void
}

/** A tab's emulator, wired to its shell in the host: started anew, or `start: null` to reattach. */
interface Opening {
  id: string
  workspaceId: string
  title: string
  command: string | undefined
  start: { cwd: string; tag: string | undefined } | null
  onExit: ((code: number | null) => void) | undefined
  tag: string | undefined
  /** A reattached command that had already ended. */
  exited?: number | null
}

/**
 * Terminal tabs: xterm.js in the window, a shell on a pseudo-terminal behind each. The shells
 * run in the background host, so a tab the host still has comes back with all it printed.
 */
export function useTerminals() {
  const [tabs, setTabs] = useState<TerminalTab[]>([])
  const live = useRef(new Map<string, Live>())

  const edit = useCallback((id: string, patch: Partial<TerminalTab>) => {
    setTabs((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }, [])

  const close = useCallback((id: string) => {
    const entry = live.current.get(id)
    live.current.delete(id)
    setTabs((list) => list.filter((t) => t.id !== id))
    if (!entry) return
    void entry.ready.then(async () => invoke('term_kill', { id })).catch(() => {})
    entry.term.dispose()
  }, [])

  const open = useCallback(
    ({ command, exited, id, onExit, start, tag, title, workspaceId }: Opening) => {
      const term = new Terminal({
        allowProposedApi: true,
        cursorBlink: true,
        fontFamily: '"Geist Mono", ui-monospace, Menlo, monospace',
        fontSize: 12.5,
        lineHeight: 1.25,
        macOptionIsMeta: true,
        scrollback: 10_000,
        theme: THEME,
      })
      // The app's shortcuts (⌘W, ⌘1–9, ⌃Tab…) reach the window's listener, not the shell.
      term.attachCustomKeyEventHandler((e) => !appShortcut(e))
      const fit = new FitAddon()
      term.loadAddon(fit)
      term.loadAddon(new WebLinksAddon((_e, uri) => void openUrl(uri)))
      const host = document.createElement('div')
      host.className = 'xterm-host h-full w-full'

      const onData = new Channel<string>()
      onData.onmessage = (data) => term.write(data)
      const onExitChannel = new Channel<number | null>()
      onExitChannel.onmessage = (code) => {
        onExit?.(code)
        // A shell that exits takes its tab with it; a command leaves its output to read.
        if (command === undefined) close(id)
        else {
          edit(id, { exited: code })
          term.write(`\r\n\x1b[2m[exited${code === null ? '' : ` with code ${code}`}]\x1b[0m\r\n`)
        }
      }
      const ready = invoke('term_open', {
        id,
        onData,
        onExit: onExitChannel,
        start: start && {
          cols: term.cols,
          command: command ?? null,
          cwd: start.cwd,
          rows: term.rows,
          tag: start.tag ?? null,
          title,
          workspaceId,
        },
      })
      ready.catch((error: unknown) => term.write(`\x1b[31m${String(error)}\x1b[0m\r\n`))
      term.onData((data) => void ready.then(async () => invoke('term_write', { data, id })))
      term.onResize(
        ({ cols, rows }) => void ready.then(async () => invoke('term_resize', { cols, id, rows }))
      )
      term.onTitleChange((next) => next.trim() !== '' && edit(id, { title: next.trim() }))

      live.current.set(id, { fit, host, opened: false, ready, term })
      const tab: TerminalTab = { createdAt: Date.now(), id, tag, title, workspaceId }
      if (exited !== undefined) tab.exited = exited
      setTabs((list) => [...list, tab])
      return id
    },
    [close, edit]
  )

  const create = useCallback(
    ({ command, cwd, onExit, tag, title, workspaceId }: Start) =>
      open({
        command,
        id: crypto.randomUUID(),
        onExit,
        start: { cwd, tag },
        tag,
        title: title ?? 'Terminal',
        workspaceId,
      }),
    [open]
  )

  /** A terminal the host kept running while the window was closed, back in its tab. */
  const reattach = useCallback(
    (t: HostTerm, onExit?: (code: number | null) => void) =>
      open({
        command: t.command ?? undefined,
        exited: t.ended ? t.code : undefined,
        id: t.id,
        onExit,
        start: null,
        tag: t.tag ?? undefined,
        title: t.title,
        workspaceId: t.workspaceId,
      }),
    [open]
  )

  /**
   * Shows a tab's terminal inside `el` and keeps it fitted; the returned function takes it
   * out again. The emulator outlives that: switching tabs keeps the scrollback.
   */
  const attach = useCallback((id: string, el: HTMLElement, focus = true) => {
    const entry = live.current.get(id)
    if (!entry) return () => {}
    el.append(entry.host)
    // xterm measures its cells on open: that needs the element in the page.
    if (!entry.opened) {
      entry.term.open(entry.host)
      entry.opened = true
      try {
        entry.term.loadAddon(new WebglAddon())
      } catch {
        // No WebGL: xterm draws with the DOM renderer, slower but the same.
      }
    }
    let frame = 0
    const refit = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => entry.fit.fit())
    }
    const observer = new ResizeObserver(refit)
    observer.observe(el)
    refit()
    if (focus) entry.term.focus()
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      entry.host.remove()
    }
  }, [])

  const rename = useCallback((id: string, title: string) => edit(id, { title }), [edit])

  const closeWorkspace = useCallback(
    (workspaceId: string) => {
      for (const t of tabs) if (t.workspaceId === workspaceId) close(t.id)
    },
    [close, tabs]
  )

  return useMemo(
    () => ({ attach, close, closeWorkspace, create, reattach, rename, tabs }),
    [attach, close, closeWorkspace, create, reattach, rename, tabs]
  )
}
