// The browser preview (`bun run web:dev` opened in a browser): Tauri's IPC answered from
// fixtures, so every screen can be looked at and screenshotted without the app. Loaded by
// main.tsx only in vite dev and only outside Tauri. Query flags reach the states fixtures
// alone cannot: `?empty` no project, `?bare` a project without workspaces, `?restart` a host
// from an older protocol holding work (the restart bar), `?update` a release waiting (the
// pill), `?attention` a chat asking from another tab (the toast), `?fail` a failing call
// (the error toast: Setup › Write it with a chat).

import { mockIPC, mockWindows } from '@tauri-apps/api/mocks'

import type { Catalog, Workspace } from '../model/catalog'

import {
  BRANCHES,
  catalog,
  DIFF,
  freshChat,
  GIT_BRANCH,
  GIT_STATUS,
  HOST_STATUS,
  HOSTED_LINES,
  INIT_ANSWER,
  LIVE,
  NOTES_ASK,
  PRS,
  quotaCache,
  reply,
  SESSIONS,
  SETTINGS,
  TERMINAL_HISTORY,
  TERMINAL_PROMPT,
  TRANSCRIPTS,
} from './fixtures'

/** A `Channel` handed over by `invoke`: the mock gets the object itself, not its id. */
interface Channel {
  onmessage: (message: unknown) => void
}

type Args = Record<string, unknown>

const flags = new URLSearchParams(location.search)
const store: Catalog = flags.has('empty') ? { chats: [], projects: [], workspaces: [] } : catalog()
if (flags.has('bare')) store.workspaces = store.workspaces.filter((w) => w.projectId !== 'p-pragma')
const chats = new Map<string, Channel>()
const terms = new Map<string, Channel>()
const unknown = new Set<string>()

/** After the call resolves, as the host's lines arrive. */
const later = (channel: Channel | undefined, messages: unknown[]) =>
  setTimeout(() => {
    for (const m of messages) channel?.onmessage(m)
  }, 30)

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
  return ws
}

function chatSend(args: Args) {
  const message = JSON.parse(str(args.line)) as {
    type?: string
    request?: { subtype?: string }
    message?: { content?: { text?: string }[] }
  }
  const channel = chats.get(str(args.id))
  if (message.type === 'control_request' && message.request?.subtype === 'initialize')
    later(channel, [...freshChat(str(args.id)), LIVE])
  else if (message.type === 'user') later(channel, reply(message.message?.content?.[0]?.text ?? ''))
}

function handle(cmd: string, args: Args): unknown {
  const path = str(args.path)
  switch (cmd) {
    case 'catalog':
      return structuredClone(store)
    case 'host_status':
      return { ...HOST_STATUS, protocolOk: !flags.has('restart') }
    case 'claude_models':
      return JSON.stringify(INIT_ANSWER)
    case 'chat_history':
      return TRANSCRIPTS[str(args.sessionId)] ?? []
    case 'chat_open': {
      const channel = args.onLine as Channel
      chats.set(str(args.id), channel)
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
      return DIFF
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
