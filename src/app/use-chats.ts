import { Channel, invoke } from '@tauri-apps/api/core'
import { useCallback, useMemo, useRef, useState } from 'react'

import type { ChatRecord, Signal } from '../model/catalog'

import { parseCommand } from '../chat/commands'
import { MCP, mcpAnswer, mcpLine, type McpRequest } from '../chat/mcp'
import {
  addNote,
  addShellTurn,
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
  runningAgents,
  sendTurn,
  shellContextLine,
  shellLine,
  shellsDone,
  STOP,
  STOP_TASK,
  stopTaskLine,
  UNQUEUE,
  unqueueLine,
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
  /** A prompt went out in this workspace: a paused one is taken back up. */
  onSent: (workspaceId: string) => void
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
      line.includes('logit_live') && (JSON.parse(line) as { type?: unknown }).type === 'logit_live'
    )
  } catch {
    return false
  }
}

/** A sub-agent's line, which `chat_history` appends after the session's own (`logitAgent`). */
function isAgentLine(line: string): boolean {
  try {
    return 'logitAgent' in (JSON.parse(line) as object)
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

/** Hands a `cancel_async_message` answer to whoever asked for it. */
function settleUnqueue(line: string, waiting: Map<string, (cancelled: boolean) => void>) {
  try {
    const m = JSON.parse(line) as {
      type?: string
      response?: { request_id?: string; response?: { cancelled?: unknown } }
    }
    if (m.type !== 'control_response') return
    waiting.get(m.response?.request_id ?? '')?.(m.response?.response?.cancelled === true)
  } catch {
    // Not JSON: not an answer.
  }
}

/** Lines applied per render while a replay pours in. */
const SLICE = 400

/** The states cut to the turns that changed between them (same reference = untouched). */
function touched(before: ChatState, after: ChatState): [ChatState, ChatState] {
  if (before.turns === after.turns) return [before, before]
  const turns = after.turns.filter((t, i) => t !== before.turns[i])
  const ids = new Set(turns.map((t) => t.id))
  return [
    { ...before, turns: before.turns.filter((t) => ids.has(t.id)) },
    { ...after, turns },
  ]
}

/** The record, following a model Claude Code newly reports (`/model` typed, a resume). */
function followModel(c: ChatTab, state: ChatState, hooks: Hooks): ChatRecord {
  if (state.model === null || state.model === c.state.model) return c.record
  const model = hooks.modelOf(state.model, c.record.model)
  return model === c.record.model ? c.record : { ...c.record, model }
}

export function chatSignal(chat: ChatTab): Signal | null {
  if (chat.state.pending.length > 0) return 'waiting'
  // A sub-agent still at work keeps the chat working, its main turn over or not.
  if (chat.state.status === 'working' || runningAgents(chat.state).length > 0) return 'working'
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
  /** Queued prompts being taken back, by request id: their answer says if Claude let go. */
  const unqueues = useRef(new Map<string, (cancelled: boolean) => void>())
  /** `/mcp`'s requests in flight, by request id. */
  const mcpWaiting = useRef(new Map<string, (answer: ReturnType<typeof mcpAnswer>) => void>())
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

  // Lines in since the last frame, applied together by `flush`.
  const queuedRef = useRef<{ apply: (c: ChatTab) => ChatTab; id: string }[]>([])
  const flush = useCallback(function flush() {
    // A slice at a time: a long replay leaves the window answering between slices.
    const batch = queuedRef.current.splice(0, SLICE)
    if (batch.length === 0) return
    if (queuedRef.current.length > 0) setTimeout(flush, 0)
    setChats((list) =>
      list.map((c) => {
        let next = c
        for (const q of batch) if (q.id === c.record.id) next = q.apply(next)
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
      // Claude Code's own measure of the context, for the composer's meter: asked of a running
      // Claude only (never to wake one), after each turn and once it is there to answer.
      const measure = () =>
        queueMicrotask(() => {
          void invoke('chat_send', { id, line: contextUsageLine(`${USAGE}${crypto.randomUUID()}`) })
        })
      if (isLive(line)) {
        live.current.add(id)
        measure()
        return
      }
      const replaying = !live.current.has(id)
      if (line.includes(UNQUEUE)) settleUnqueue(line, unqueues.current)
      // `/mcp`'s answers go to its panel, never into the chat.
      const mcpAnswered = mcpAnswer(line)
      if (mcpAnswered) {
        mcpWaiting.current.get(mcpAnswered.requestId)?.(mcpAnswered)
        return
      }
      queuedRef.current.push({
        apply: (c: ChatTab) => {
          const state = reduceLine(c.state, line)
          const sessionId = state.sessionId ?? c.record.sessionId
          const followed = followModel(c, state, latest.current.hooks)
          const asked = state.pending.length > c.state.pending.length
          const finished = c.state.status === 'working' && state.status === 'idle'
          // `initialize` answered: a resumed chat holds its whole past before any new turn.
          const ready = /"request_id":\s*"init-/.test(line)
          if ((finished && !replaying) || ready) measure()
          const withSession =
            sessionId === followed.sessionId ? followed : { ...followed, sessionId }
          // A result just in: the workspace's age restarts (not for a replayed one).
          const record =
            finished && !replaying ? { ...withSession, activeAt: Date.now() } : withSession
          // A replay redraws what happened; the host's `unread` already says what was missed.
          const next = { ...c, record, state, unread: c.unread || (finished && !replaying) }
          if ((asked || finished) && !replaying) {
            queueMicrotask(() => latest.current.hooks.onAttention(next, asked ? 'waiting' : 'done'))
          }
          // Only the turns this line touched: the whole chat per line made a replay quadratic.
          const [was, now] = touched(c.state, state)
          for (const artifact of newPublishes(blocksOf(was), blocksOf(now))) {
            queueMicrotask(() => latest.current.hooks.onArtifact(next, artifact, !replaying))
          }
          // A `!` command's output: into the conversation, for Claude's next prompt.
          for (const shell of shellsDone(was, now)) {
            if (replaying) continue
            const told = shellContextLine(shell.command, shell.output ?? '', shell.exitCode)
            queueMicrotask(() => void invoke('chat_send', { id, line: told }))
          }
          // Just compacted: measure what is left, so the meter drops at once.
          const emptied = c.state.context !== null || c.state.usage !== null
          if (emptied && state.context === null && state.usage === null && !replaying) measure()
          return next
        },
        id,
      })
      // A reattach replays thousands of lines: one render per frame, not one per line.
      if (queuedRef.current.length === 1) setTimeout(flush, 16)
    },
    [flush]
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
        queueMicrotask(() => latest.current.hooks.onSent(c.record.workspaceId))
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

  /**
   * Takes back prompts Claude has queued and not started yet: true for each it let go of
   * (gone from the queue), false for one it had already taken.
   */
  const unqueue = useCallback(
    async (id: string, uuids: readonly string[]): Promise<boolean[]> =>
      Promise.all(
        uuids.map(
          async (uuid) =>
            new Promise<boolean>((resolve) => {
              const requestId = `${UNQUEUE}${uuid}`
              // An old Claude that never answers keeps the prompt.
              const timer = setTimeout(() => settle(false), 3000)
              const settle = (cancelled: boolean) => {
                clearTimeout(timer)
                unqueues.current.delete(requestId)
                resolve(cancelled)
              }
              unqueues.current.set(requestId, settle)
              void write(id, unqueueLine(uuid))
            })
        )
      ),
    [write]
  )

  /** A `!` command: run in the chat's worktree by Claude Code, shown with its output. */
  const shell = useCallback(
    (id: string, command: string) => {
      const uuid = crypto.randomUUID()
      edit(id, (c) => ({
        ...c,
        record: { ...c.record, activeAt: Date.now() },
        state: addShellTurn(c.state, command, uuid),
      }))
      void write(id, shellLine(command, uuid))
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

  /**
   * One of `/mcp`'s requests, written to the chat's Claude (woken if asleep): its answer, or a
   * rejection with what Claude Code said. Signing in waits on nothing but the auth URL.
   */
  const mcp = useCallback(
    async (id: string, request: McpRequest) =>
      new Promise<Record<string, unknown>>((resolve, reject) => {
        const requestId = `${MCP}${crypto.randomUUID()}`
        const timer = setTimeout(() => settle(null), 30_000)
        const settle = (answer: ReturnType<typeof mcpAnswer>) => {
          clearTimeout(timer)
          mcpWaiting.current.delete(requestId)
          if (answer === null) reject(new Error('Claude Code did not answer. Try again.'))
          else if (answer.ok) resolve(answer.answer)
          else reject(new Error(answer.error))
        }
        mcpWaiting.current.set(requestId, settle)
        write(id, mcpLine(requestId, request)).catch((error: unknown) =>
          settle({ error: String(error), ok: false, requestId })
        )
      }),
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
      mcp,
      openSession,
      rename,
      restore,
      seen,
      send,
      setEffort,
      setModel,
      shell,
      stopTask,
      unqueue,
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
      mcp,
      openSession,
      rename,
      restore,
      seen,
      send,
      setEffort,
      setModel,
      shell,
      unqueue,
      wake,
    ]
  )
}

/** Turns ended by a workspace's chats: the PR is read again after each (Claude may open it). */
export const turnsEnded = (chats: readonly ChatTab[], workspaceId: string | undefined) =>
  chats
    .filter((c) => c.record.workspaceId === workspaceId)
    .reduce((n, c) => n + c.state.turns.filter((t) => t.end !== undefined).length, 0)
