import { Channel, invoke } from '@tauri-apps/api/core'
import { useCallback, useMemo, useRef, useState } from 'react'

import type { ChatRecord, Signal } from '../model/catalog'

import { parseCommand } from '../chat/commands'
import {
  addNote,
  blocksOf,
  type ChatState,
  contextUsageLine,
  type Image,
  initialChat,
  initializeLine,
  interruptLine,
  newPublishes,
  type Permission,
  permissionLine,
  type Published,
  publishedArtifacts,
  reduceLine,
  replayTranscript,
  resolvePermission,
  sendTurn,
  STOP,
  STOP_TASK,
  stopTaskLine,
  USAGE,
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
  /**
   * The chat published an artifact: `live` as it happens, or not (found in a replay or the
   * transcript, which must not pull it to the front).
   */
  onArtifact: (chat: ChatTab, artifact: Published, live: boolean) => void
  /** False while an old background host holds the chats: a second Claude would corrupt one. */
  canStart: () => boolean
  /** The record's model for the one Claude Code says it runs (see `reportedModel`). */
  modelOf: (reported: string, current: string) => string
}

const TITLE_LENGTH = 40

const oneLine = (text: string) => text.replaceAll(/\s+/g, ' ').trim()

/** A first prompt as a tab title: cut at a word before 40 characters, with an ellipsis. */
export function titleOf(text: string): string {
  const flat = oneLine(text)
  if (flat.length <= TITLE_LENGTH) return flat
  const cut = flat.slice(0, TITLE_LENGTH - 1)
  const word = cut.lastIndexOf(' ')
  return `${(word > TITLE_LENGTH / 2 ? cut.slice(0, word) : cut).replace(/[\s,.;:–—-]+$/, '')}…`
}

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

/** A sub-agent's line, which `chat_history` appends after the session's own (`aimuxAgent`). */
function isAgentLine(line: string): boolean {
  try {
    return 'aimuxAgent' in (JSON.parse(line) as object)
  } catch {
    return false
  }
}

/** How many lines of the session's own transcript there are: what the host counts from. */
export const historyLength = (history: readonly string[]) =>
  history.filter((l) => !isAgentLine(l)).length

/**
 * The transcript as it was when the host started Claude: its first `len` lines of its own, then
 * the sub-agents'. Cutting the whole list would let sub-agent lines push the cut past the
 * start, and the host's replay would add those messages again, out of place.
 */
export function historyBefore(history: readonly string[], len: number): string[] {
  const own = history.filter((l) => !isAgentLine(l))
  return [...own.slice(0, len), ...history.filter(isAgentLine)]
}

/** The record, following a model Claude Code newly reports (`/model` typed, a resume). */
function followModel(c: ChatTab, state: ChatState, hooks: Hooks): ChatRecord {
  if (state.model === null || state.model === c.state.model) return c.record
  const model = hooks.modelOf(state.model, c.record.model)
  return model === c.record.model ? c.record : { ...c.record, model }
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
        const followed = followModel(c, state, latest.current.hooks)
        const asked = state.pending.length > c.state.pending.length
        const finished = c.state.status === 'working' && state.status === 'idle'
        const withSession = sessionId === followed.sessionId ? followed : { ...followed, sessionId }
        // A result just in: the workspace's age restarts (not for a replayed one).
        const record =
          finished && !replaying ? { ...withSession, activeAt: Date.now() } : withSession
        // A replay redraws what happened; the host's `unread` already says what was missed.
        const next = { ...c, record, state, unread: c.unread || (finished && !replaying) }
        if ((asked || finished) && !replaying) {
          queueMicrotask(() => latest.current.hooks.onAttention(next, asked ? 'waiting' : 'done'))
        }
        for (const artifact of newPublishes(blocksOf(c.state), blocksOf(state))) {
          queueMicrotask(() => latest.current.hooks.onArtifact(next, artifact, !replaying))
        }
        // Just compacted: measure what is left, so the meter drops at once.
        const emptied = c.state.context !== null || c.state.usage !== null
        if (emptied && state.context === null && state.usage === null && !replaying) {
          const ask = contextUsageLine(`${USAGE}${crypto.randomUUID()}`)
          queueMicrotask(() => void invoke('chat_send', { id, line: ask }))
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
      const { effort, sessionId } = chat.record
      const host = hosted.current.get(id)
      hosted.current.delete(id)
      const start = async () => {
        await stopping.current.get(id)
        const history =
          sessionId === null
            ? []
            : await invoke<string[]>('chat_history', { sessionId }).catch(() => [])
        // The host replays everything since Claude started: the transcript gives what came before.
        const lines = host ? historyBefore(history, host.historyLen) : history
        // The transcript says which model the session was on last: it resumes on that one.
        const replayed = replayTranscript(lines)
        const { model } = followModel(chat, replayed, latest.current.hooks)
        if (sessionId !== null) {
          edit(id, (c) => {
            const next = {
              ...c,
              record: followModel(c, replayed, latest.current.hooks),
              state: replayed,
            }
            // What it published before this window was here: listed, never brought forward.
            for (const artifact of publishedArtifacts(blocksOf(replayed))) {
              queueMicrotask(() => latest.current.hooks.onArtifact(next, artifact, false))
            }
            return next
          })
        }
        // Read-only until then: the transcript shows, nothing runs.
        if (!latest.current.hooks.canStart()) throw new Error(HOST_BLOCKED)
        const channel = new Channel<string>()
        // A cleared chat's old Claude may still speak: only this one's lines count.
        channel.onmessage = (line) => {
          if (procs.current.get(id) === proc) onLine(id, line)
        }
        const begin = {
          cwd: chat.cwd,
          effort,
          historyLen: historyLength(lines),
          model,
          resume: sessionId,
        }
        await invoke('chat_open', { id, onLine: channel, start: host ? null : begin })
        if (!host) await invoke('chat_send', { id, line: initializeLine(`init-${id}`) })
      }
      const proc = start()
      procs.current.set(id, proc)
      proc.catch((error: unknown) => {
        if (procs.current.get(id) !== proc) return
        const message = error instanceof Error ? error.message : String(error)
        // Held by an old host: the transcript stays, read-only; the bar above says why.
        const errors = message === HOST_BLOCKED ? [] : [message]
        edit(id, (c) => ({ ...c, state: { ...c.state, errors, status: 'exited' } }))
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
          // Whole: the tab truncates it, and shows it in full on hover.
          title: oneLine(title) || 'New chat',
          workspaceId,
        },
        cwd
      ),
    [add]
  )

  const send = useCallback(
    (id: string, text: string, images: readonly Image[] = []) => {
      const uuid = crypto.randomUUID()
      edit(id, (c) => {
        // The first real prompt names the tab; a command or an image alone does not.
        const names = c.record.title === 'New chat' && text !== '' && parseCommand(text) === null
        const record = {
          ...c.record,
          activeAt: Date.now(),
          ...(names && { title: titleOf(text) }),
        }
        const state = sendTurn(c.state, text, uuid, images)
        // A prompt that starts a turn starts its clock; a queued one waits for its own.
        const started = c.state.status === 'working' ? {} : { startedAt: Date.now() }
        return { ...c, record, state: { ...state, ...started } }
      })
      // Claude Code fills in its own session id; an empty one is accepted.
      void write(id, userLine(text, null, uuid, images))
    },
    [edit, write]
  )

  const answer = useCallback(
    (
      id: string,
      permission: Permission,
      choice: 'allow' | 'always' | 'deny',
      answers?: Record<string, string>
    ) => {
      edit(id, (c) => ({ ...c, state: resolvePermission(c.state, permission.requestId) }))
      void write(id, permissionLine(permission, choice, answers))
    },
    [edit, write]
  )

  /** Esc: says "Stopping…" at once; the turn's result ends it. */
  const interrupt = useCallback(
    (id: string) => {
      edit(id, (c) =>
        c.state.status === 'working' ? { ...c, state: { ...c.state, stopping: true } } : c
      )
      void write(id, interruptLine(`${STOP}${crypto.randomUUID()}`))
    },
    [edit, write]
  )

  /** Stops one of the chat's sub-agents or background shells; its task event says it ended. */
  const stopTask = useCallback(
    (id: string, taskId: string) =>
      void write(id, stopTaskLine(`${STOP_TASK}${crypto.randomUUID()}`, taskId)),
    [write]
  )

  /** Asks Claude Code what fills the context; its answer lands in `state.usage`. */
  const askUsage = useCallback(
    (id: string) => void write(id, contextUsageLine(`${USAGE}${crypto.randomUUID()}`)),
    [write]
  )

  const rename = useCallback(
    (id: string, title: string) => edit(id, (c) => ({ ...c, record: { ...c.record, title } })),
    [edit]
  )

  /** A `/model` or `/effort` typed shows as sent; one picked elsewhere as a faint `note`. */
  const command = useCallback(
    (id: string, text: string, note: string | undefined) => {
      if (note === undefined) {
        send(id, text)
        return
      }
      edit(id, (c) => ({ ...c, state: addNote(c.state, note, crypto.randomUUID()) }))
      void write(id, userLine(text, null))
    },
    [edit, send, write]
  )

  /** The model for the rest of this chat, and for its resumes. `default` is Claude Code's. */
  const setModel = useCallback(
    (id: string, model: string, note?: string) => {
      edit(id, (c) => ({ ...c, record: { ...c.record, model: model === 'default' ? '' : model } }))
      command(id, `/model ${model}`, note)
    },
    [command, edit]
  )

  const setEffort = useCallback(
    (id: string, effort: string, note?: string) => {
      edit(id, (c) => ({ ...c, record: { ...c.record, effort } }))
      // An empty effort is Claude Code's own choice: `auto`.
      command(id, `/effort ${effort || 'auto'}`, note)
    },
    [command, edit]
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
      askUsage,
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
      stopTask,
      wake,
    }),
    [
      answer,
      askUsage,
      stopTask,
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

/** Turns ended by a workspace's chats: the PR is read again after each (Claude may open it). */
export const turnsEnded = (chats: readonly ChatTab[], workspaceId: string | undefined) =>
  chats
    .filter((c) => c.record.workspaceId === workspaceId)
    .reduce((n, c) => n + c.state.turns.filter((t) => t.end !== undefined).length, 0)
