// The browser preview (`bun run web:dev` opened in a browser): Tauri's IPC answered from
// fixtures, so every screen can be looked at and screenshotted without the app. Loaded by
// main.tsx only in vite dev and only outside Tauri. Query flags reach the states fixtures
// alone cannot: `?empty` no project, `?bare` a project without workspaces, `?restart` a host
// from an older protocol holding work (the restart bar), `?update` a release waiting (the
// pill), `?attention` a chat asking from another tab (the toast), `?fail` a failing call
// (the error toast: Setup › Write it with a chat), `?long` long names, many tabs and files
// (truncation), `?empty-inbox` nothing waiting or done, `?merged` amber's PR merged (Clean up
// with a full transcript to crumble). Replies stream in over about two
// seconds; every other one asks to run a tool first. Stage, discard, push and merge change
// what the panel shows. A setup run takes about eight seconds; deleting a workspace with
// changes (stat tiles' Clean up, teal's menu) is refused, so "Delete anyway" shows.
// basil has no PR and two commits to push.

import { mockIPC, mockWindows } from '@tauri-apps/api/mocks'

import type { FileChange } from '../app/use-git'
import type { Catalog, Workspace } from '../model/catalog'

import {
  asTranscript,
  BRANCHES,
  catalog,
  CONTEXT_OUTPUT,
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
  QUESTION_ASK,
  quotaCache,
  SESSIONS,
  SETTINGS,
  SETUP_RUN,
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
if (flags.has('merged'))
  for (const pr of Object.values(PRS)) if (pr.number === 128) pr.state = 'MERGED'
if (flags.has('bare')) store.workspaces = store.workspaces.filter((w) => w.projectId !== 'p-pragma')
// When each chat's last turn moved (store.rs `active_at`): the sidebar's ages differ.
const ACTIVE_AGO: Record<string, number> = {
  'chat-menus': 3 * 60_000,
  'chat-notes': 12 * 60_000,
  'chat-resume': 2 * 3_600_000,
}
for (const c of store.chats) {
  const ago = ACTIVE_AGO[c.id]
  if (ago !== undefined) Object.assign(c, { activeAt: Date.now() - ago })
}
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
if (flags.has('empty-inbox')) {
  for (const c of hostList.chats) Object.assign(c, { unread: false, waiting: false })
}
const chats = new Map<string, Channel>()
/** The session each started chat resumed, if any, and the model it was started on. */
const resumes = new Map<string, string | null>()
const startModels = new Map<string, string>()
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
if (!flags.has('empty-inbox'))
  asked.set('perm-tests', { chatId: 'chat-menus', prompt: 'the tests', toolId: 'tool-test' })
/** What the host replays of a chat; `?empty-inbox` leaves its question out. */
const replayOf = (id: string) => {
  const lines = (HOSTED_LINES[id] ?? []).filter(
    (l) =>
      !(flags.has('empty-inbox') || flags.has('question')) ||
      !l.includes('"subtype":"can_use_tool"')
  )
  // `?question`: the busy chat's ask is AskUserQuestion's, before it goes live.
  return flags.has('question') && id === 'chat-menus'
    ? [...lines.slice(0, -1), ...QUESTION_ASK, ...lines.slice(-1)]
    : lines
}
if (flags.has('question'))
  asked.set('perm-question', { chatId: 'chat-menus', prompt: 'a question', toolId: 'tool-ask' })
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

/** Chats in a turn (a reply being written, or a question waiting). */
const working = new Set<string>(flags.has('empty-inbox') ? [] : ['chat-menus'])
interface Prompt {
  text: string
  uuid: string
}
/** Prompts sent during a turn: once its result is out, Claude Code takes them all as one. */
const queued = new Map<string, Prompt[]>()

/** A turn's lines over `ms`, its `result` last; then the next queued prompt starts. */
function turn(chatId: string, lines: string[], ms = 2000) {
  drip(chatId, lines, ms)
  timers.get(chatId)?.push(setTimeout(() => nextTurn(chatId), 160 + ms))
}

function nextTurn(chatId: string) {
  working.delete(chatId)
  const waiting = queued.get(chatId) ?? []
  // Every text prompt goes in together; a command waits for its own turn, after them.
  const command = (p: Prompt) => p.text.startsWith('/')
  const texts = waiting.filter((p) => !command(p))
  const next = texts.length > 0 ? texts : waiting.slice(0, 1)
  queued.set(
    chatId,
    waiting.filter((p) => !next.includes(p))
  )
  if (next.length > 0) answerPrompt(chatId, next)
}

/** What Claude Code says as it starts a prompt. */
const startedLine = (p: Prompt) =>
  JSON.stringify({ command_uuid: p.uuid, state: 'started', type: 'command_lifecycle' })

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

function answerPrompt(chatId: string, prompts: Prompt[]) {
  if (working.has(chatId)) {
    queued.set(chatId, [...(queued.get(chatId) ?? []), ...prompts])
    return
  }
  working.add(chatId)
  later(chats.get(chatId), prompts.map(startedLine))
  const text = prompts.map((p) => p.text).join('\n\n')
  const model = /^\/model\s+(\S+)/.exec(text)?.[1]
  const effort = /^\/effort\s+(\S+)/.exec(text)?.[1]
  if (model !== undefined) {
    turn(chatId, localOutput(`Set model to ${MODEL_NAMES.get(model) ?? model}`), 100)
  } else if (effort !== undefined) {
    turn(chatId, localOutput(`Set effort level to ${effort}`), 100)
  } else if (text.trim() === '/context') {
    turn(chatId, localOutput(CONTEXT_OUTPUT), 100)
  } else if (replies++ % 2 === 1) {
    // Every other prompt: a tool first, and its permission.
    const requestId = `perm-${crypto.randomUUID()}`
    const toolId = `tool-${crypto.randomUUID()}`
    asked.set(requestId, { chatId, prompt: text, toolId })
    drip(chatId, toolAsk(`m-${crypto.randomUUID()}`, toolId, requestId, text), 1200)
  } else {
    turn(chatId, [...streamedReply(`m-${crypto.randomUUID()}`, previewAnswer(text)), turnEnd()])
  }
}

function chatSend(args: Args) {
  const id = str(args.id)
  const message = JSON.parse(str(args.line)) as {
    type?: string
    uuid?: string
    request_id?: string
    request?: { subtype?: string }
    message?: { content?: { text?: string }[] }
    response?: {
      request_id?: string
      response?: { behavior?: string; updatedInput?: { answers?: Record<string, string> } }
    }
  }
  const channel = chats.get(id)
  if (message.type === 'control_request' && message.request?.subtype === 'initialize')
    later(channel, [...freshChat(id, resumes.get(id) ?? null, startModels.get(id)), LIVE])
  else if (message.type === 'control_request' && message.request?.subtype === 'interrupt') {
    const busy = working.has(id)
    stop(id)
    for (const [key, a] of asked) if (a.chatId === id) asked.delete(key)
    // Esc ends the turn; what was queued behind it still runs. With nothing running,
    // Claude only acknowledges it.
    const [ack, end] = interrupted(str(message.request_id))
    if (busy) turn(id, [ack ?? '', end ?? ''], 4000)
    else later(channel, [ack])
  } else if (message.type === 'control_response') {
    const requestId = str(message.response?.request_id)
    const ask = asked.get(requestId)
    if (!ask) return
    asked.delete(requestId)
    const allowed = message.response?.response?.behavior === 'allow'
    const answers = message.response?.response?.updatedInput?.answers
    let after = allowed ? 'The tests pass: 86 of 86.' : 'Understood, I will not run them.'
    if (answers) after = `Going with ${Object.values(answers).join('; ')}.`
    turn(id, [
      toolDone(ask.toolId, allowed),
      ...streamedReply(`m-${crypto.randomUUID()}`, after),
      turnEnd(0.0031, 4200),
    ])
  } else if (message.type === 'user') {
    const text = message.message?.content?.[0]?.text ?? ''
    answerPrompt(id, [{ text, uuid: message.uuid ?? crypto.randomUUID() }])
  }
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
      const start = args.start as { resume?: string | null; model?: string } | null
      resumes.set(str(args.id), start?.resume ?? null)
      startModels.set(str(args.id), start?.model ?? '')
      if (args.start === null) later(channel, replayOf(str(args.id)))
      if (flags.has('attention') && args.id === 'chat-notes')
        setTimeout(() => channel.onmessage(NOTES_ASK), 1500)
      return null
    }
    case 'setup_ran': {
      // Kept, as store.rs keeps it: the strip says how the last run ended after a reload.
      const w = store.workspaces.find((x) => x.id === args.workspaceId)
      if (w) w.setup = { exitCode: (args.exitCode as number | null) ?? null, ranAt: Date.now() }
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
      const start = args.start as { command?: string | null } | null
      if (typeof start?.command === 'string') {
        // A setup script: it prints as it goes, and ends after a while.
        const exit = args.onExit as Channel
        for (const [i, l] of SETUP_RUN.entries()) {
          setTimeout(() => channel.onmessage(l), 400 + i * 1200)
        }
        setTimeout(() => exit.onmessage(0), 400 + SETUP_RUN.length * 1200)
      } else later(channel, [args.start === null ? TERMINAL_HISTORY : TERMINAL_PROMPT])
      return null
    }
    case 'term_write': {
      const data = str(args.data)
      terms.get(str(args.id))?.onmessage(data === '\r' ? `\r\n${TERMINAL_PROMPT}` : data)
      return null
    }
    case 'workspace_create':
      return createWorkspace(args)
    case 'workspace_remove': {
      // As git does: a worktree with changes is removed only by force.
      const w = store.workspaces.find((x) => x.id === args.id)
      if (w && args.force !== true && (GIT_STATUS[w.path] ?? []).length > 0) {
        throw new Error(
          `fatal: '${w.path}' contains modified or untracked files, use --force to delete it`
        )
      }
      store.workspaces = store.workspaces.filter((x) => x.id !== args.id)
      return null
    }
    case 'workspace_rename': {
      const w = store.workspaces.find((x) => x.id === args.id)
      if (!w) throw new Error('unknown workspace')
      w.name = str(args.name).trim() || w.branch.replace(/^aimux\//, '')
      return structuredClone(w)
    }
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
    case 'write_setting': {
      const { id, value } = args as { id: string; value: unknown }
      const settings: Record<string, unknown> = SETTINGS.settings
      if (value === null) delete settings[id]
      else settings[id] = value
      return null
    }
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
