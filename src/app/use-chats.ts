import { Channel, invoke } from '@tauri-apps/api/core'
import { useCallback, useMemo, useRef, useState } from 'react'

import type { ChatRecord, Signal } from '../model/catalog'

import { parseCommand } from '../chat/commands'
import {
  addUserTurn,
  type ChatState,
  initialChat,
  initializeLine,
  interruptLine,
  type Permission,
  permissionLine,
  reduceLine,
  replayTranscript,
  resolvePermission,
  userLine,
} from '../chat/model'
import { HOST_BLOCKED, type HostChat } from './use-host'

export interface ChatTab {
  record: ChatRecord
  cwd: string
  state: ChatState
  /** A turn ended that nobody has looked at yet. */
  unread: boolean
}

interface Hooks {
  /** The record changed (a title, a session id): the store keeps it for the next launch. */
  onRecord: (record: ChatRecord) => void
  /** A chat asks for permission, or finished a turn. */
  onAttention: (chat: ChatTab, kind: 'waiting' | 'done') => void
  /** False while an old background host holds the chats: a second Claude would corrupt one. */
  canStart: () => boolean
}

const TITLE_LENGTH = 40

const titleOf = (text: string) => text.replaceAll(/\s+/g, ' ').trim().slice(0, TITLE_LENGTH)

/** The host's mark between a chat's replay and what happens from now on. */
function isLive(line: string): boolean {
  try {
    return (
      line.includes('aimux_live') && (JSON.parse(line) as { type?: unknown }).type === 'aimux_live'
    )
  } catch {
    return false
  }
}

export function chatSignal(chat: ChatTab): Signal | null {
  if (chat.state.pending.length > 0) return 'waiting'
  if (chat.state.status === 'working') return 'working'
  return chat.unread ? 'done' : null
}

/**
 * Native chats over Claude Code run headless in the background host, one process each. A chat
 * the host still runs is reattached at launch; one brought back from the store sleeps until
 * it is opened: then its transcript is read and Claude resumes it.
 */
export function useChats(hooks: Hooks) {
  const [chats, setChats] = useState<ChatTab[]>([])
  const procs = useRef(new Map<string, Promise<void>>())
  /** Chats the host was running at launch, until they are reattached. */
  const hosted = useRef(new Map<string, HostChat>())
  /** Chats past their replay: only what arrives after it calls for attention. */
  const live = useRef(new Set<string>())
  /** A cleared chat's old Claude, until it is gone: the new one waits for it. */
  const stopping = useRef(new Map<string, Promise<unknown>>())
  const latest = useRef({ chats, hooks })
  latest.current = { chats, hooks }

  const edit = useCallback((id: string, f: (chat: ChatTab) => ChatTab) => {
    setChats((list) =>
      list.map((c) => {
        if (c.record.id !== id) return c
        const next = f(c)
        if (next.record !== c.record) {
          const { record } = next
          queueMicrotask(() => latest.current.hooks.onRecord(record))
        }
        return next
      })
    )
  }, [])

  const onLine = useCallback(
    (id: string, line: string) => {
      if (isLive(line)) {
        live.current.add(id)
        return
      }
      const replaying = !live.current.has(id)
      edit(id, (c) => {
        const state = reduceLine(c.state, line)
        const sessionId = state.sessionId ?? c.record.sessionId
        const record = sessionId === c.record.sessionId ? c.record : { ...c.record, sessionId }
        const asked = state.pending.length > c.state.pending.length
        const finished = c.state.status === 'working' && state.status === 'idle'
        // A replay redraws what happened; the host's `unread` already says what was missed.
        const next = { ...c, record, state, unread: c.unread || (finished && !replaying) }
        if ((asked || finished) && !replaying) {
          queueMicrotask(() => latest.current.hooks.onAttention(next, asked ? 'waiting' : 'done'))
        }
        return next
      })
    },
    [edit]
  )

  /** Starts the chat's Claude if it is not running: resumed from its session when it has one. */
  const wake = useCallback(
    // Async, but nothing awaits before the process is recorded: two calls share one Claude.
    async (id: string): Promise<void> => {
      const known = procs.current.get(id)
      if (known) return known
      const chat = latest.current.chats.find((c) => c.record.id === id)
      if (!chat) throw new Error('no such chat')
      const { effort, model, sessionId } = chat.record
      const host = hosted.current.get(id)
      hosted.current.delete(id)
      const start = async () => {
        await stopping.current.get(id)
        const history =
          sessionId === null
            ? []
            : await invoke<string[]>('chat_history', { sessionId }).catch(() => [])
        // The host replays everything since Claude started: the transcript gives what came before.
        const lines = host ? history.slice(0, host.historyLen) : history
        if (sessionId !== null) edit(id, (c) => ({ ...c, state: replayTranscript(lines) }))
        // Read-only until then: the transcript shows, nothing runs.
        if (!latest.current.hooks.canStart()) throw new Error(HOST_BLOCKED)
        const channel = new Channel<string>()
        // A cleared chat's old Claude may still speak: only this one's lines count.
        channel.onmessage = (line) => {
          if (procs.current.get(id) === proc) onLine(id, line)
        }
        const begin = { cwd: chat.cwd, effort, historyLen: lines.length, model, resume: sessionId }
        await invoke('chat_open', { id, onLine: channel, start: host ? null : begin })
        if (!host) await invoke('chat_send', { id, line: initializeLine(`init-${id}`) })
      }
      const proc = start()
      procs.current.set(id, proc)
      proc.catch((error: unknown) => {
        if (procs.current.get(id) !== proc) return
        edit(id, (c) => ({
          ...c,
          state: {
            ...c.state,
            errors: [error instanceof Error ? error.message : String(error)],
            status: 'exited',
          },
        }))
      })
      return proc
    },
    [edit, onLine]
  )

  const write = useCallback(
    async (id: string, line: string) => {
      await wake(id)
      await invoke('chat_send', { id, line })
    },
    [wake]
  )

  /** Chats saved by an earlier launch: those the host still runs reattach, the rest sleep. */
  const restore = useCallback(
    (records: { record: ChatRecord; cwd: string }[], host: HostChat[]) => {
      const list = records.map(({ cwd, record }) => ({
        cwd,
        record,
        state: { ...initialChat, status: 'idle' as const },
        unread: host.some((h) => h.id === record.id && h.unread),
      }))
      latest.current.chats = list
      setChats(list)
      for (const h of host) {
        if (!h.alive || !list.some((c) => c.record.id === h.id)) continue
        hosted.current.set(h.id, h)
        void wake(h.id).catch(() => {})
      }
    },
    [wake]
  )

  const add = useCallback(
    (record: ChatRecord, cwd: string) => {
      const chat = { cwd, record, state: initialChat, unread: false }
      latest.current.chats = [...latest.current.chats, chat]
      setChats((list) => [...list, chat])
      latest.current.hooks.onRecord(record)
      void wake(record.id)
      return record.id
    },
    [wake]
  )

  const create = useCallback(
    (workspaceId: string, cwd: string, agent: { model: string; effort: string }) =>
      add(
        {
          createdAt: Date.now(),
          effort: agent.effort,
          id: crypto.randomUUID(),
          model: agent.model,
          sessionId: null,
          title: 'New chat',
          workspaceId,
        },
        cwd
      ),
    [add]
  )

  /** An earlier session in a new tab: its transcript shows, then Claude resumes it. */
  const openSession = useCallback(
    (workspaceId: string, cwd: string, sessionId: string, title: string) =>
      add(
        {
          createdAt: Date.now(),
          // Claude Code's own defaults, as `claude --resume` would.
          effort: '',
          id: crypto.randomUUID(),
          model: '',
          sessionId,
          title: titleOf(title) || 'New chat',
          workspaceId,
        },
        cwd
      ),
    [add]
  )

  const send = useCallback(
    (id: string, text: string) => {
      edit(id, (c) => {
        // The first real prompt names the tab; a command does not.
        const names = c.record.title === 'New chat' && parseCommand(text) === null
        const record = names ? { ...c.record, title: titleOf(text) } : c.record
        return { ...c, record, state: addUserTurn(c.state, text, crypto.randomUUID()) }
      })
      // Claude Code fills in its own session id; an empty one is accepted.
      void write(id, userLine(text, null))
    },
    [edit, write]
  )

  const answer = useCallback(
    (id: string, permission: Permission, choice: 'allow' | 'always' | 'deny') => {
      edit(id, (c) => ({ ...c, state: resolvePermission(c.state, permission.requestId) }))
      void write(id, permissionLine(permission, choice))
    },
    [edit, write]
  )

  const interrupt = useCallback(
    (id: string) => void write(id, interruptLine(`stop-${crypto.randomUUID()}`)),
    [write]
  )

  const rename = useCallback(
    (id: string, title: string) => edit(id, (c) => ({ ...c, record: { ...c.record, title } })),
    [edit]
  )

  /** The model for the rest of this chat, and for its resumes. `default` is Claude Code's. */
  const setModel = useCallback(
    (id: string, model: string) => {
      edit(id, (c) => ({ ...c, record: { ...c.record, model: model === 'default' ? '' : model } }))
      send(id, `/model ${model}`)
    },
    [edit, send]
  )

  const setEffort = useCallback(
    (id: string, effort: string) => {
      edit(id, (c) => ({ ...c, record: { ...c.record, effort } }))
      send(id, `/effort ${effort}`)
    },
    [edit, send]
  )

  /** A fresh session in the same tab; the old one stays on disk for `/resume`. */
  const clear = useCallback(
    (id: string) => {
      const proc = procs.current.get(id)
      procs.current.delete(id)
      hosted.current.delete(id)
      live.current.delete(id)
      const stopped = (proc ?? Promise.resolve())
        .catch(() => {})
        .then(async () => invoke('chat_stop', { id }))
        .catch(() => {})
      stopping.current.set(id, stopped)
      const reset = (c: ChatTab): ChatTab =>
        c.record.id === id
          ? { ...c, record: { ...c.record, sessionId: null }, state: initialChat, unread: false }
          : c
      // `wake` reads the record before the next render: no session, no resume.
      latest.current.chats = latest.current.chats.map(reset)
      edit(id, reset)
      void wake(id).catch(() => {})
    },
    [edit, wake]
  )

  const seen = useCallback(
    (id: string) => {
      if (latest.current.chats.some((c) => c.record.id === id && c.unread)) {
        edit(id, (c) => ({ ...c, unread: false }))
      }
    },
    [edit]
  )

  /** Stops the process; the tab goes. */
  const close = useCallback((id: string) => {
    const proc = procs.current.get(id)
    procs.current.delete(id)
    live.current.delete(id)
    setChats((list) => list.filter((c) => c.record.id !== id))
    void proc?.then(async () => invoke('chat_stop', { id })).catch(() => {})
  }, [])

  return useMemo(
    () => ({
      answer,
      chats,
      clear,
      close,
      create,
      interrupt,
      openSession,
      rename,
      restore,
      seen,
      send,
      setEffort,
      setModel,
      wake,
    }),
    [
      answer,
      chats,
      clear,
      close,
      create,
      interrupt,
      openSession,
      rename,
      restore,
      seen,
      send,
      setEffort,
      setModel,
      wake,
    ]
  )
}
