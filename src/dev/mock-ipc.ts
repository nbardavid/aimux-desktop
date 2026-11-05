// The browser preview (`bun run web:dev` opened in a browser): Tauri's IPC answered from
// fixtures, so every screen can be looked at and screenshotted without the app. Loaded by
// main.tsx only in vite dev and only outside Tauri. Query flags reach the states fixtures
// alone cannot: `?empty` no project, `?bare` a project without workspaces, `?restart` a host
// from an older protocol holding work (the restart bar), `?update` a release waiting (the
// pill), `?attention` a chat asking from another tab (the toast), `?fail` a failing call
// (the error toast: Setup › Write it with a chat), `?long` long names, many tabs and files
// (truncation). Replies stream in over about two seconds; every other one asks to run a
// tool first. Stage, discard, push and merge change what the panel shows.

import { mockIPC, mockWindows } from '@tauri-apps/api/mocks'

import type { FileChange } from '../app/use-git'
import type { Catalog, Workspace } from '../model/catalog'

import {
  asTranscript,
  BRANCHES,
  catalog,
  diffOf,
  freshChat,
  GIT_BRANCH,
  GIT_STATUS,
  HOST_STATUS,
  HOSTED_LINES,
  INIT_ANSWER,
  interrupted,
  LIVE,
  localOutput,
  longFixture,
  NOTES_ASK,
  previewAnswer,
  PRS,
  quotaCache,
  SESSIONS,
  SETTINGS,
  streamedReply,
  TERMINAL_HISTORY,
  TERMINAL_PROMPT,
  toolAsk,
  toolDone,
  TRANSCRIPTS,
  turnEnd,
} from './fixtures'

/** A `Channel` handed over by `invoke`: the mock gets the object itself, not its id. */
interface Channel {
  onmessage: (message: unknown) => void
}

type Args = Record<string, unknown>

const flags = new URLSearchParams(location.search)
const store: Catalog = flags.has('empty') ? { chats: [], projects: [], workspaces: [] } : catalog()
if (flags.has('bare')) store.workspaces = store.workspaces.filter((w) => w.projectId !== 'p-pragma')
const hostList = structuredClone(HOST_STATUS.list)
if (flags.has('long')) {
  const long = longFixture()
  store.projects.push(long.project)
  store.workspaces.push(long.workspace)
  store.chats.push(...long.chats)
  hostList.terms.push(...long.terms)
  GIT_STATUS[long.path] = long.files
  GIT_BRANCH[long.path] = long.branch
}
const chats = new Map<string, Channel>()
/** The session each started chat resumed, if any. */
const resumes = new Map<string, string | null>()
const terms = new Map<string, Channel>()
const unknown = new Set<string>()

/** After the call resolves, as the host's lines arrive. */
const later = (channel: Channel | undefined, messages: unknown[]) =>
  setTimeout(() => {
    for (const m of messages) channel?.onmessage(m)
  }, 30)

/** A chat's lines still to come, so an interrupt can cut them short. */
const timers = new Map<string, ReturnType<typeof setTimeout>[]>()
/** A permission the preview's Claude waits on: the tool it asked for. */
const asked = new Map<string, { chatId: string; toolId: string; prompt: string }>()
// The fixtures' own pending permissions.
asked.set('perm-tests', { chatId: 'chat-menus', prompt: 'the tests', toolId: 'tool-test' })
let replies = 0

/** Lines spread over `ms`, as Claude writes them. */
function drip(chatId: string, lines: string[], ms = 2000) {
  const channel = chats.get(chatId)
  const list = timers.get(chatId) ?? []
  for (const [i, l] of lines.entries()) {
    list.push(setTimeout(() => channel?.onmessage(l), 120 + (i * ms) / lines.length))
  }
  timers.set(chatId, list)
}

function stop(chatId: string) {
  for (const t of timers.get(chatId) ?? []) clearTimeout(t)
  timers.delete(chatId)
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')

function createWorkspace(args: Args): Workspace {
  const name = (args.candidates as string[] | undefined)?.[0] ?? 'crimson'
  const project = store.projects.find((p) => p.id === args.projectId)
  const ws: Workspace = {
    base: str(args.base) || 'main',
    branch: `aimux/${name}`,
    createdAt: Date.now(),
    id: `ws-${crypto.randomUUID()}`,
    name,
    path: `${project?.path ?? ''}-worktrees/${name}`,
    projectId: str(args.projectId),
    setup: null,
  }
  store.workspaces.push(ws)
  // A fresh worktree: nothing changed, its branch not on the remote yet.
  GIT_STATUS[ws.path] = []
  GIT_BRANCH[ws.path] = { ahead: 0, behind: 0, branch: ws.branch, remote: true, upstream: false }
  return ws
}

const MODEL_NAMES = new Map(
  (INIT_ANSWER.models as { value: string; displayName: string }[]).map((m) => [
    m.value,
    m.displayName.replace(/\s*\(recommended\)$/i, ''),
  ])
)

/** Prompts sent while a permission waits: Claude Code takes them once the turn moves on. */
const queued = new Map<string, string[]>()

function answerPrompt(chatId: string, text: string) {
  if ([...asked.values()].some((a) => a.chatId === chatId)) {
    queued.set(chatId, [...(queued.get(chatId) ?? []), text])
    return
  }
  const model = /^\/model\s+(\S+)/.exec(text)?.[1]
  const effort = /^\/effort\s+(\S+)/.exec(text)?.[1]
  if (model !== undefined) {
    drip(chatId, localOutput(`Set model to ${MODEL_NAMES.get(model) ?? model}`), 100)
  } else if (effort !== undefined) {
    drip(chatId, localOutput(`Set effort level to ${effort}`), 100)
  } else if (replies++ % 2 === 1) {
    // Every other prompt: a tool first, and its permission.
    const requestId = `perm-${crypto.randomUUID()}`
    const toolId = `tool-${crypto.randomUUID()}`
    asked.set(requestId, { chatId, prompt: text, toolId })
    drip(chatId, toolAsk(`m-${crypto.randomUUID()}`, toolId, requestId, text), 1200)
  } else {
    drip(chatId, [...streamedReply(`m-${crypto.randomUUID()}`, previewAnswer(text)), turnEnd()])
  }
}

function chatSend(args: Args) {
  const id = str(args.id)
  const message = JSON.parse(str(args.line)) as {
    type?: string
    request_id?: string
    request?: { subtype?: string }
    message?: { content?: { text?: string }[] }
    response?: { request_id?: string; response?: { behavior?: string } }
  }
  const channel = chats.get(id)
  if (message.type === 'control_request' && message.request?.subtype === 'initialize')
    later(channel, [...freshChat(id, resumes.get(id) ?? null), LIVE])
  else if (message.type === 'control_request' && message.request?.subtype === 'interrupt') {
    stop(id)
    for (const [key, a] of asked) if (a.chatId === id) asked.delete(key)
    queued.delete(id)
    drip(id, interrupted(str(message.request_id)), 4000)
  } else if (message.type === 'control_response') {
    const requestId = str(message.response?.request_id)
    const ask = asked.get(requestId)
    if (!ask) return
    asked.delete(requestId)
    const allowed = message.response?.response?.behavior === 'allow'
    const after = allowed ? 'The tests pass: 86 of 86.' : 'Understood, I will not run them.'
    drip(id, [
      toolDone(ask.toolId, allowed),
      ...streamedReply(`m-${crypto.randomUUID()}`, after),
      turnEnd(0.0031, 4200),
    ])
    const next = queued.get(id) ?? []
    queued.delete(id)
    timers.get(id)?.push(
      setTimeout(() => {
        for (const t of next) answerPrompt(id, t)
      }, 2500)
    )
  } else if (message.type === 'user') answerPrompt(id, message.message?.content?.[0]?.text ?? '')
}

/** The transcript Claude Code keeps of a session: a fixture's, or what its host replays. */
function history(sessionId: string): string[] {
  const own = TRANSCRIPTS[sessionId]
  if (own) return own
  const chat = store.chats.find((c) => c.sessionId === sessionId)
  return asTranscript(HOSTED_LINES[chat?.id ?? ''] ?? [])
}

function setGitFlags(path: string, files: string[] | 'all', patch: Partial<FileChange>) {
  for (const f of GIT_STATUS[path] ?? []) {
    if (files === 'all' || files.includes(f.path)) Object.assign(f, patch)
  }
}

function handle(cmd: string, args: Args): unknown {
  const path = str(args.path)
  switch (cmd) {
    case 'catalog':
      return structuredClone(store)
    case 'host_status':
      return { list: hostList, protocolOk: !flags.has('restart') }
    case 'claude_models':
      return JSON.stringify(INIT_ANSWER)
    case 'chat_history':
      return history(str(args.sessionId))
    case 'chat_open': {
      const channel = args.onLine as Channel
      chats.set(str(args.id), channel)
      const start = args.start as { resume?: string | null } | null
      resumes.set(str(args.id), start?.resume ?? null)
      if (args.start === null) later(channel, HOSTED_LINES[str(args.id)] ?? [])
      if (flags.has('attention') && args.id === 'chat-notes')
        setTimeout(() => channel.onmessage(NOTES_ASK), 1500)
      return null
    }
    case 'chat_send':
      chatSend(args)
      return null
    case 'chat_save': {
      const chat = args.chat as Catalog['chats'][number]
      store.chats = [...store.chats.filter((c) => c.id !== chat.id), chat]
      return null
    }
    case 'chat_forget':
      store.chats = store.chats.filter((c) => c.id !== args.id)
      return null
    case 'term_open': {
      const channel = args.onData as Channel
      terms.set(str(args.id), channel)
      later(channel, [args.start === null ? TERMINAL_HISTORY : TERMINAL_PROMPT])
      return null
    }
    case 'term_write': {
      const data = str(args.data)
      terms.get(str(args.id))?.onmessage(data === '\r' ? `\r\n${TERMINAL_PROMPT}` : data)
      return null
    }
    case 'workspace_create':
      return createWorkspace(args)
    case 'workspace_remove':
      store.workspaces = store.workspaces.filter((w) => w.id !== args.id)
      return null
    case 'project_remove':
      store.projects = store.projects.filter((p) => p.id !== args.id)
      return null
    case 'git_status':
      return GIT_STATUS[path] ?? []
    case 'git_branch':
      return GIT_BRANCH[path] ?? null
    case 'pr_view':
      return PRS[path] === undefined ? null : JSON.stringify(PRS[path])
    case 'git_diff':
      return diffOf(path, str(args.file))
    case 'git_stage': {
      const files = args.all === true ? 'all' : (args.files as string[])
      setGitFlags(path, files, { staged: true, unstaged: false, untracked: false })
      return null
    }
    case 'git_unstage': {
      const files = args.all === true ? 'all' : (args.files as string[])
      for (const f of GIT_STATUS[path] ?? []) {
        if (!f.staged || (files !== 'all' && !files.includes(f.path))) continue
        // A file added from nothing goes back to untracked.
        Object.assign(f, f.status === 'A' ? { untracked: true } : { unstaged: true })
        f.staged = false
      }
      return null
    }
    case 'git_discard': {
      const list = GIT_STATUS[path] ?? []
      const f = list.find((x) => x.path === args.file)
      if (f?.staged === true) f.unstaged = false
      else GIT_STATUS[path] = list.filter((x) => x !== f)
      return null
    }
    case 'git_push': {
      const b = GIT_BRANCH[path]
      if (b) Object.assign(b, { ahead: 0, upstream: true })
      return null
    }
    case 'pr_merge': {
      const pr = PRS[path]
      if (pr) pr.state = 'MERGED'
      return null
    }
    case 'git_branches':
      return BRANCHES
    case 'claude_sessions':
      return SESSIONS
    case 'setup_status':
      return { exists: args.projectId === 'p-aimux', path: '.aimux/setup.sh' }
    case 'ensure_setup_script':
      if (flags.has('fail')) throw new Error('Could not write .aimux/setup.sh: permission denied')
      return `${path}/.aimux/setup.sh`
    case 'read_quota_cache':
      return quotaCache()
    case 'read_settings':
      return SETTINGS
    case 'update_check':
      return flags.has('update') ? '0.2.0' : null
    case 'plugin:window|is_focused':
      return true
    // Fire-and-forget writes: nothing to show for them.
    case 'project_open':
    case 'term_resize':
    case 'term_kill':
    case 'chat_stop':
    case 'setup_ran':
    case 'write_setting':
    case 'write_quota_cache':
    case 'host_restart':
      return null
    default:
      if (!unknown.has(cmd)) {
        unknown.add(cmd)
        // oxlint-disable-next-line no-console -- the preview says once what it does not mock
        console.info(`[mock-ipc] ${cmd} is not mocked; it resolves to null.`, args)
      }
      return null
  }
}

mockWindows('main')
mockIPC((cmd, args) => handle(cmd, (args ?? {}) as Args), { shouldMockEvents: true })
