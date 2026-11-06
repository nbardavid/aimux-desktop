import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { revealItemInDir } from '@tauri-apps/plugin-opener'
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'

import { notify, playChosenSound } from './app/attention'
import { ChatView } from './app/chat-view'
import { cleanupOf } from './app/cleanup-effect'
import { ContextMenu, type MenuItem, type MenuState } from './app/context-menu'
import { GitMode } from './app/git-mode'
import { GitPanel } from './app/git-panel'
import { HostBar } from './app/host-bar'
import { Inbox } from './app/inbox'
import { afterClose, paletteItems, paletteTarget, stepThrough } from './app/navigation'
import { NewWorkspace } from './app/new-workspace'
import { overlayShown } from './app/overlay'
import { Picker, type PickerItem } from './app/picker'
import { PR_PROMPT, SETUP_PROMPT } from './app/prompts'
import { Quotas } from './app/quotas'
import { resumeTarget, type Session } from './app/resume'
import { ResumePicker } from './app/resume-picker'
import { SettingsView } from './app/settings-view'
import { SetupSection } from './app/setup-section'
import { type DiffStat, type RowMenu, Sidebar, workspaceFacts } from './app/sidebar'
import { Slide, Splitter } from './app/splitter'
import { TabBar, type TabItem } from './app/tab-bar'
import { TerminalView } from './app/terminal-view'
import { type Attention, AttentionToast, errorText, type Notice, NoticeToast } from './app/toast'
import { TopBar } from './app/top-bar'
import { UpdateButton, useUpdate } from './app/update-button'
import { useCatalog } from './app/use-catalog'
import { chatSignal, type ChatTab, useChats } from './app/use-chats'
import { type FileChange, useGit } from './app/use-git'
import { HOST_BLOCKED, useHost } from './app/use-host'
import {
  GIT_WIDTH,
  gitWidthNow,
  LIMITS,
  SIDE_WIDTH,
  sideWidthNow,
  useLayout,
} from './app/use-layout'
import { useModels } from './app/use-models'
import { useQuotas } from './app/use-quotas'
import { useSetup } from './app/use-setup'
import { useTerminals } from './app/use-terminals'
import { availableCommands } from './chat/commands'
import { type ChatState, type Image, initialChat, toolSummary } from './chat/model'
import { uncommittedRefusal } from './git/pr'
import {
  chatFlags,
  type ChatSettings,
  DEFAULT_CHAT,
  effortName,
  modelName,
  normalize,
  reportedModel,
} from './model/agents'
import { byProject, strongest, type Workspace } from './model/catalog'
import { inboxOf } from './model/inbox'
import { nameCandidates } from './model/names'

// What a new tab can be, as in Conductor: a native Claude chat, or a shell.
const NEW_TAB: PickerItem[] = [
  { key: 'chat', label: 'Chat', meta: '⌘T' },
  { key: 'terminal', label: 'Terminal', meta: '⇧⌘T' },
]

const CHAT_SETTINGS = 'aimux.chat'

/** The chat an empty workspace offers: nothing runs until its first Enter. */
const DRAFT: ChatState = { ...initialChat, status: 'idle' }

// The shell's repeated pieces: the splash, the quiet empty states, the toasts.
const SPLASH = 'text-muted-foreground grid h-full place-items-center p-6 text-center'
const QUIET =
  'text-faint flex flex-1 flex-col items-center justify-center gap-3 px-3 py-8 text-center'
const EMPTY_TITLE = 'text-foreground text-lg'
/** A key cap on the ink button. */
const KBD_INK = 'text-white/60'

function readChatSettings(): ChatSettings {
  // A per-window convenience: storage may be empty or refused, the defaults then hold.
  try {
    const raw = localStorage.getItem(CHAT_SETTINGS)
    return raw === null
      ? DEFAULT_CHAT
      : { ...DEFAULT_CHAT, ...(JSON.parse(raw) as Partial<ChatSettings>) }
  } catch {
    return DEFAULT_CHAT
  }
}

const copy = (text: string) => void navigator.clipboard.writeText(text)

/** `/resume`'s palette, for the chat it was typed in. (`/model` and `/effort` open the
 * chat's own model picker.) */
interface CommandPick {
  name: 'resume'
  chatId: string
  args: string
}

function sum(changes: FileChange[] | null | undefined): DiffStat {
  let add = 0
  let del = 0
  for (const file of changes ?? []) {
    add += file.add ?? 0
    del += file.del ?? 0
  }
  return { add, del }
}

export function App() {
  const store = useCatalog()
  const { catalog, project, projects, status, workspace: ws } = store
  const projectId = project?.id ?? null
  const [mode, setMode] = useState<'normal' | 'git' | 'settings'>('normal')
  const [overlay, setOverlay] = useState<'projects' | 'new-tab' | null>(null)
  // Where the new-tab menu drops from.
  const [menuAt, setMenuAt] = useState<{ left: number; top: number } | null>(null)
  const { commands: appWideCommands, models } = useModels()
  const [stored, setSelectionState] = useState(readChatSettings)
  // What was picked under an older model list falls back to what this one offers.
  const selection = normalize(stored, models)
  const [composeIn, setComposeIn] = useState<string | null>(null)
  const [ctxMenu, setCtxMenu] = useState<MenuState | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  // A rename `/rename` started: its title also goes to Claude, so `/resume` shows it.
  const renameTells = useRef<string | null>(null)
  const [commandPick, setCommandPick] = useState<CommandPick | null>(null)
  const [inboxAt, setInboxAt] = useState<{ x: number; y: number } | null>(null)
  // A tab whose agent is working closes on the second ask: ⌘W twice, or × twice.
  const [armed, setArmed] = useState<string | null>(null)
  const [activeByWs, setActiveByWs] = useState<Record<string, string>>({})
  const [attention, setAttention] = useState<Attention | null>(null)
  const keys = useRef({
    /** Opens the attention toast's chat, when one is up. */
    attention: (): boolean => false,
    close: () => {},
    compose: () => {},
    newTab: (_kind: 'chat' | 'terminal') => {},
    stepTab: (_step: 1 | -1) => {},
    stepWorkspace: (_step: 1 | -1) => {},
    toWorkspace: (_index: number) => {},
  })
  const [gitFile, setGitFile] = useState<FileChange>()
  const [notice, setNotice] = useState<Notice | null>(null)
  /** Shows a failure as a toast titled with what was being done. */
  const fail = (title: string) => (error: unknown) => setNotice({ text: errorText(error), title })
  const [renamingWs, setRenamingWs] = useState<string | null>(null)
  const terminals = useTerminals()
  const appUpdate = useUpdate()
  const host = useHost()
  /** The tab on screen, when the window has the focus: what needs no calling out. */
  const watching = useRef<string | null>(null)

  const workspaces = useMemo(() => byProject(catalog), [catalog])
  const placeOf = (workspaceId: string) => {
    const w = catalog.workspaces.find((x) => x.id === workspaceId)
    const p = projects.find((x) => x.id === w?.projectId)
    return { project: p, workspace: w }
  }
  const placeRef = useRef(placeOf)
  placeRef.current = placeOf

  const chats = useChats({
    canStart: () => host.state.kind === 'ready',
    modelOf: (reported, current) => reportedModel(reported, current, models),
    onArtifact: (chat, artifact, live) => {
      const { record } = chat
      void store
        .addArtifact(record.workspaceId, artifact.url, artifact.title, record.id, live)
        .catch(() => {})
    },
    onAttention: (chat: ChatTab, kind) => {
      if (watching.current === chat.record.id) return
      const { project: p, workspace: w } = placeRef.current(chat.record.workspaceId)
      if (!p || !w) return
      void playChosenSound()
      void (async () => {
        if (!(await getCurrentWindow().isFocused())) {
          await notify(
            `${chat.record.title} ${kind === 'waiting' ? 'is waiting for you' : 'is done'}`
          )
        } else if (kind === 'waiting') {
          const ask = chat.state.pending[0]
          setAttention({
            asks: ask
              ? {
                  tool: ask.toolName,
                  what: toolSummary(ask.toolName, ask.input, chat.cwd) || (ask.description ?? ''),
                }
              : null,
            chatId: chat.record.id,
            projectId: p.id,
            title: chat.record.title,
            where: `${w.name} · ${p.name}`,
            workspaceId: w.id,
          })
        }
      })()
    },
    onRecord: store.saveChat,
  })
  // The sidebar's ages and task titles: the open chats' live records over the saved ones.
  const sidebarChats = useMemo(() => {
    const live = new Map(chats.chats.map((c) => [c.record.id, c.record]))
    return [...catalog.chats.filter((r) => !live.has(r.id)), ...live.values()]
  }, [catalog.chats, chats.chats])

  /** A setup script's end is kept for the git panel, even when the window missed it. */
  const { reload } = store
  const setupRan = useCallback(
    (workspaceId: string) => (exitCode: number | null) =>
      void invoke('setup_ran', { exitCode, workspaceId }).then(reload),
    [reload]
  )

  // Chats an earlier launch left open come back, in the worktrees that still exist: live when
  // the background host still runs them, asleep otherwise. Its terminals come back as tabs.
  // A host too old to keep gives nothing back until it is restarted.
  const restored = useRef(false)
  useEffect(() => {
    if (status.kind !== 'ready' || host.state.kind === 'loading' || restored.current) return
    restored.current = true
    const list = host.state.kind === 'ready' ? host.state.list : { chats: [], terms: [] }
    chats.restore(
      catalog.chats.flatMap((record) => {
        const w = catalog.workspaces.find((x) => x.id === record.workspaceId)
        return w ? [{ cwd: w.path, record }] : []
      }),
      list.chats
    )
    for (const t of list.terms) {
      terminals.reattach(t, t.tag === 'setup' ? setupRan(t.workspaceId) : undefined)
    }
  }, [catalog, chats, host.state, setupRan, status.kind, terminals])

  const wsChats = chats.chats.filter((c) => c.record.workspaceId === ws?.id)
  const wsTerms = terminals.tabs.filter((t) => t.workspaceId === ws?.id)
  const tabItems: (TabItem & { at: number })[] = [
    ...wsChats.map((c) => ({
      at: c.record.createdAt,
      chat: true,
      id: c.record.id,
      signal: chatSignal(c),
      title: c.record.title,
    })),
    ...wsTerms.map((t) => ({
      at: t.createdAt,
      chat: false,
      id: t.id,
      signal: null,
      title: t.title,
    })),
  ].toSorted((a, b) => a.at - b.at)
  const active = tabItems.find((t) => t.id === activeByWs[ws?.id ?? '']) ?? tabItems[0]
  /** The workspace's last setup run still in a tab. */
  const setupTab = wsTerms.findLast((t) => t.tag === 'setup')
  const chat = active?.chat === true ? wsChats.find((c) => c.record.id === active.id) : undefined
  const term = active?.chat === false ? wsTerms.find((t) => t.id === active.id) : undefined
  // Where you are, for ⌘P's Recent: the chat on screen, else the workspace. Kept per window.
  let here = ws ? `ws:${ws.id}` : null
  if (chat) here = `chat:${chat.record.id}`
  const [visited, setVisited] = useState<string[]>([])
  useEffect(() => {
    if (here !== null) setVisited((v) => [here, ...v.filter((k) => k !== here)].slice(0, 20))
  }, [here])
  // The chat on screen asks something: ⌘↩ answers it, whatever toast is up.
  const questionHere = mode === 'normal' && chat !== undefined && chat.state.pending.length > 0

  const selectTab = (workspaceId: string, tabId: string) =>
    setActiveByWs((state) => ({ ...state, [workspaceId]: tabId }))

  // The chat on screen runs, and what it finished is read.
  const chatOnScreen = chat?.record.id
  useEffect(() => {
    if (chatOnScreen === undefined) return
    void chats.wake(chatOnScreen).catch(() => {})
  }, [chatOnScreen, chats])
  useEffect(() => {
    const look = async () => {
      const focused = await getCurrentWindow().isFocused()
      watching.current = focused && mode === 'normal' ? (active?.id ?? null) : null
      if (watching.current !== null) chats.seen(watching.current)
    }
    void look()
    const window_ = getCurrentWindow()
    const unlisten = window_.onFocusChanged(() => void look())
    return () => void unlisten.then((f) => f())
  }, [active?.id, chats, mode])

  const paths = useMemo(() => catalog.workspaces.map((w) => w.path), [catalog.workspaces])
  const git = useGit(ws?.path, paths)
  const quotas = useQuotas()
  const { layout, update } = useLayout()
  const setup = useSetup(projectId)
  const changes = ws === undefined ? undefined : git.changes[ws.path]
  const diffs = useMemo(
    () => Object.fromEntries(Object.entries(git.changes).map(([path, c]) => [path, sum(c)])),
    [git.changes]
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Settings and the diff are pages: Esc leaves them, unless something sits over them.
        const over = overlay !== null || composeIn !== null || ctxMenu !== null || inboxAt !== null
        if (mode === 'normal' || e.defaultPrevented || over || overlayShown()) return
        setMode('normal')
      } else if (e.ctrlKey && e.key === 'Tab') keys.current.stepTab(e.shiftKey ? -1 : 1)
      // ⌃1–9: the tabs of this workspace; ⌘1–9: the workspaces, in sidebar order.
      else if (e.ctrlKey && !e.metaKey && /^Digit[1-9]$/.test(e.code)) {
        const tab = tabItems[Number(e.code.slice(5)) - 1]
        if (tab === undefined || ws === undefined || mode !== 'normal') return
        selectTab(ws.id, tab.id)
      } else if (!e.metaKey) return
      else if (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        keys.current.stepWorkspace(e.key === 'ArrowDown' ? 1 : -1)
      }
      // e.code: with Option held, e.key is the composed character.
      else if (e.code === 'KeyB' && e.altKey) update({ gitOpen: !layout.gitOpen })
      else if (e.code === 'KeyB') update({ sideOpen: !layout.sideOpen })
      else if (e.key === 'p') setOverlay('projects')
      else if (e.key.toLowerCase() === 't') keys.current.newTab(e.shiftKey ? 'terminal' : 'chat')
      else if (e.key === 'w') keys.current.close()
      else if (e.key === 'n') keys.current.compose()
      else if (e.key === 'g') setMode((m) => (m === 'git' ? 'normal' : 'git'))
      else if (e.key === ',') setMode((m) => (m === 'settings' ? 'normal' : 'settings'))
      // ⌘O works on the splash too, before the rest of the keys are wired.
      else if (e.code === 'KeyO') void newProject()
      else if (/^Digit[1-9]$/.test(e.code)) keys.current.toWorkspace(Number(e.code.slice(5)) - 1)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // While the attention toast is up, ⌘↩ opens its chat: it goes first, so the chat on screen
  // does not take it as Allow.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey && !e.shiftKey && e.key === 'Enter' && keys.current.attention()) {
        e.preventDefault()
        e.stopImmediatePropagation()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  // No browser menu (Reload, Inspect…): rows bring their own; text fields keep Copy and Paste.
  useEffect(() => {
    const onMenu = (e: MouseEvent) => {
      const editable =
        e.target instanceof HTMLElement && e.target.closest('input, textarea, .xterm') !== null
      if (!editable && (window.getSelection()?.toString() ?? '') === '') e.preventDefault()
    }
    window.addEventListener('contextmenu', onMenu)
    return () => window.removeEventListener('contextmenu', onMenu)
  }, [])

  useEffect(() => {
    if (armed === null) return
    const timer = setTimeout(() => setArmed(null), 2500)
    return () => clearTimeout(timer)
  }, [armed])

  const newProject = async () => {
    const path = await openDialog({ directory: true, title: 'Open a folder as a project' })
    if (typeof path !== 'string') return
    try {
      await store.addProject(path)
      setMode('normal')
    } catch (error) {
      fail("Couldn't open the folder")(error)
    }
  }

  if (status.kind !== 'ready') {
    return <main className={SPLASH}>{status.kind === 'error' ? status.message : 'Opening…'}</main>
  }

  if (projects.length === 0) {
    return (
      <main className={SPLASH}>
        <div className={QUIET}>
          <span className={EMPTY_TITLE}>Open a repository to start</span>
          <span>Each piece of work then gets its own worktree, with its chats and terminals.</span>
          <Button onClick={() => void newProject()}>
            Open a folder
            <Kbd className={KBD_INK}>⌘O</Kbd>
          </Button>
        </div>
      </main>
    )
  }

  const setSelection = (next: ChatSettings) => {
    setSelectionState(next)
    try {
      localStorage.setItem(CHAT_SETTINGS, JSON.stringify(next))
    } catch {
      // Remembering the choice is a convenience; chats then open on the defaults.
    }
  }

  const newChat = (w: Workspace, prompt?: string, images: readonly Image[] = []) => {
    const id = chats.create(w.id, w.path, chatFlags(selection))
    selectTab(w.id, id)
    if ((prompt ?? '') !== '' || images.length > 0) chats.send(id, prompt ?? '', images)
    return id
  }

  /** The git panel's "Ask for PR": the chat on screen asks, else the newest, else a new one. */
  const askForPr = (w: Workspace) => {
    const id = (chat ?? wsChats.at(-1))?.record.id ?? newChat(w)
    selectTab(w.id, id)
    chats.send(id, PR_PROMPT)
  }
  /** A chat (with the last model and effort picked) or a shell, in this workspace. */
  const createTab = (kind: string) => {
    setOverlay(null)
    if (ws === undefined) return
    if (host.state.kind !== 'ready') {
      setNotice({ text: HOST_BLOCKED, title: `Couldn't open a ${kind}` })
    } else if (kind === 'chat') newChat(ws)
    else selectTab(ws.id, terminals.create({ cwd: ws.path, workspaceId: ws.id }))
  }

  /** The project's setup script in a tab of `w`; how it ended is kept for the git panel. */
  const runSetup = async (w: Workspace) => {
    if (host.state.kind !== 'ready') throw new Error(HOST_BLOCKED)
    const script = await invoke<string>('ensure_setup_script', { projectId: w.projectId })
    const id = terminals.create({
      command: `bash '${script.replaceAll("'", "'\\''")}'`,
      cwd: w.path,
      onExit: setupRan(w.id),
      tag: 'setup',
      title: 'Setup',
      workspaceId: w.id,
    })
    return id
  }

  /** The composer's Create: a worktree, its setup, a chat in it with the prompt sent. */
  const startWork = async (pid: string, base: string | null, prompt: string) => {
    if (host.state.kind !== 'ready') throw new Error(HOST_BLOCKED)
    setMode('normal')
    const taken = (workspaces[pid] ?? []).map((w) => w.name)
    const created = await store.createWorkspace(pid, nameCandidates(taken), base)
    const hasScript = await invoke<{ exists: boolean }>('setup_status', { projectId: pid })
    if (hasScript.exists) await runSetup(created)
    newChat(created, prompt)
  }

  /** Its tabs close only once the worktree is gone: a refusal (changes) leaves them be. */
  const removeWorkspace = async (w: Workspace, force: boolean) => {
    await store.removeWorkspace(w.id, force)
    terminals.closeWorkspace(w.id)
    for (const c of chats.chats) if (c.record.workspaceId === w.id) chats.close(c.record.id)
  }

  const rowMenu = (row: RowMenu) => {
    const path = row.kind === 'project' ? row.project.path : row.workspace.path
    const items: MenuItem[] = []
    if (row.kind === 'project')
      items.push({ label: 'New workspace…', run: () => setComposeIn(row.project.id) })
    items.push({ label: 'Show in Finder', run: async () => revealItemInDir(path) })
    items.push({ label: 'Copy path', run: () => copy(path) })
    if (row.kind === 'workspace') {
      const { branch, id } = row.workspace
      items.push({ label: 'Copy branch name', run: () => copy(branch) })
      items.unshift({ label: 'Rename', run: () => setRenamingWs(id) }, 'separator')
    }
    if (row.kind === 'project') {
      const owned = workspaces[row.project.id] ?? []
      items.push('separator', {
        confirm: {
          button: 'Close project',
          text: `Close ${row.project.name}? It leaves the app; its folder and worktrees stay on disk.`,
        },
        danger: true,
        label: 'Close project…',
        run: async () => {
          await store.removeProject(row.project.id)
          for (const w of owned) {
            terminals.closeWorkspace(w.id)
            for (const c of chats.chats) if (c.record.workspaceId === w.id) chats.close(c.record.id)
          }
        },
      })
    }
    if (row.kind === 'workspace') {
      const w = row.workspace
      items.push('separator', {
        confirm: {
          button: 'Delete',
          cautious: true,
          text: `Delete ${w.name}? Its tabs close and its worktree folder is removed. The branch ${w.branch} stays.`,
          ...((signals[w.id] === 'working' || signals[w.id] === 'waiting') && {
            warning: ' · Claude is working',
          }),
        },
        danger: true,
        label: 'Delete workspace…',
        retry: {
          button: 'Delete anyway',
          run: async () => removeWorkspace(w, true),
          text: `${w.name} has uncommitted changes. Deleting it anyway discards them.`,
          when: uncommittedRefusal,
        },
        run: async () => removeWorkspace(w, false),
      })
    }
    setCtxMenu({ items, x: row.x, y: row.y })
  }

  const requestClose = (id: string) => {
    const chatTab = wsChats.find((c) => c.record.id === id)
    if (chatTab?.state.status === 'working' && armed !== id) {
      setArmed(id)
      return
    }
    setArmed(null)
    // The neighbour takes over, as in a browser: the tab to the right, else to the left.
    const next = afterClose(
      tabItems.map((t) => t.id),
      id,
      active?.id
    )
    if (ws !== undefined && next !== undefined && next !== active?.id) selectTab(ws.id, next)
    if (chatTab) {
      chats.close(id)
      store.forgetChat(id)
    } else terminals.close(id)
  }

  /** Every workspace, in sidebar order: ⌘1–9 and ⌥⌘↑/↓ go through it. */
  const order = projects.flatMap((p) => workspaces[p.id] ?? [])
  keys.current = {
    attention: () => {
      if (attention === null || questionHere) return false
      goTo(attention.projectId, attention.workspaceId, attention.chatId)
      setAttention(null)
      return true
    },
    close: () => {
      if (active !== undefined && mode === 'normal') requestClose(active.id)
    },
    compose: () => projectId !== null && setComposeIn(projectId),
    newTab: (kind: 'chat' | 'terminal') => createTab(kind),
    stepTab: (step) => {
      const next = stepThrough(
        tabItems.map((t) => t.id),
        active?.id,
        step
      )
      if (ws !== undefined && next !== undefined && mode === 'normal') selectTab(ws.id, next)
    },
    stepWorkspace: (step) => {
      const next = stepThrough(
        order.map((w) => w.id),
        ws?.id,
        step
      )
      const target = order.find((w) => w.id === next)
      if (target) {
        setMode('normal')
        store.select(target.projectId, target.id)
      }
    },
    toWorkspace: (index) => {
      const target = order[index]
      if (!target) return
      setMode('normal')
      store.select(target.projectId, target.id)
    },
  }

  // After a merge, the worktree that carried the branch is dead weight.
  const cleanup = cleanupOf(ws, removeWorkspace)

  const inbox = inboxOf(
    chats.chats.map((c) => ({
      signal: c.record.id === watching.current ? null : chatSignal(c),
      tabId: c.record.id,
      title: c.record.title,
      workspaceId: c.record.workspaceId,
    })),
    projects,
    catalog.workspaces
  )

  const signals: Record<string, ReturnType<typeof strongest>> = {}
  for (const w of catalog.workspaces) {
    signals[w.id] = strongest(
      chats.chats.filter((c) => c.record.workspaceId === w.id).map(chatSignal)
    )
  }

  // What this workspace's Claude is doing, for the git panel's questions.
  const wsSignal = ws === undefined ? null : (signals[ws.id] ?? null)
  const claudeHere = wsSignal === 'done' ? null : wsSignal

  /** A chat's model and effort, as its record keeps them ('' is Claude Code's default). */
  const agentOf = (c: ChatTab) =>
    normalize({ effort: c.record.effort, model: c.record.model || 'default' }, models)

  /**
   * Picked in the chat's footer, by `/model`, `/effort` or ⇧⌘/: told to Claude at once. A typed
   * command shows as sent; a pick shows as one faint line ("Model → Sonnet 5.5").
   */
  const setAgent = (c: ChatTab, next: ChatSettings, typed: boolean) => {
    const now = agentOf(c)
    const id = c.record.id
    if (next.model !== now.model) {
      chats.setModel(id, next.model, typed ? undefined : `Model → ${modelName(next.model, models)}`)
    }
    if (next.effort !== now.effort) {
      chats.setEffort(
        id,
        next.effort,
        typed ? undefined : `Intelligence → ${effortName(next.effort)}`
      )
    }
  }

  /** The app's own `/` commands; Claude's others are sent as typed. */
  const runCommand = (c: ChatTab, name: string, args: string) => {
    const id = c.record.id
    if (name === 'clear') chats.clear(id)
    else if (name === 'rename' && args !== '') {
      chats.rename(id, args)
      chats.send(id, `/rename ${args}`)
    } else if (name === 'rename') {
      renameTells.current = id
      setRenaming(id)
    } else if (name === 'resume') setCommandPick({ args, chatId: id, name })
  }

  /** A session open in a tab is that tab; else it opens in a new one where it ran. */
  const resume = (session: Session) => {
    setCommandPick(null)
    if (ws === undefined || projectId === null) return
    const open = chats.chats.map((c) => ({
      id: c.record.id,
      sessionId: c.record.sessionId,
      workspaceId: c.record.workspaceId,
    }))
    const target = resumeTarget(session, open, workspaces[projectId] ?? [], ws.id)
    const pid = placeOf(target.workspaceId).project?.id ?? projectId
    if (target.kind === 'tab') goTo(pid, target.workspaceId, target.chatId)
    else {
      const title = session.title || session.firstPrompt
      goTo(
        pid,
        target.workspaceId,
        chats.openSession(target.workspaceId, target.cwd, session.id, title)
      )
    }
  }

  const pickFor = commandPick && chats.chats.find((c) => c.record.id === commandPick.chatId)

  const tabMenu = (item: TabItem, x: number, y: number) =>
    setCtxMenu({
      items: [
        { label: 'Rename', run: () => setRenaming(item.id) },
        { label: 'Close', run: () => requestClose(item.id), shortcut: '⌘W' },
      ],
      x,
      y,
    })

  /** Takes you to a chat anywhere: its project, its workspace, its tab. */
  const goTo = (pid: string, wid: string, tabId: string) => {
    setMode('normal')
    store.select(pid, wid)
    selectTab(wid, tabId)
  }

  const searchItems = () =>
    paletteItems(
      projects,
      workspaces,
      chats.chats.map((c) => ({
        activeAt: c.record.activeAt ?? c.record.createdAt,
        id: c.record.id,
        title: c.record.title,
        workspaceId: c.record.workspaceId,
      })),
      signals,
      ws?.id ?? null,
      {
        activeAt: Object.fromEntries(
          catalog.workspaces.map((w) => [w.id, workspaceFacts(w, sidebarChats).activeAt])
        ),
        here,
        recent: visited,
      }
    )

  /** ⌘P's pick: a workspace, a chat in its tab, or a project. */
  const goToItem = (key: string) => {
    setOverlay(null)
    const { id, kind } = paletteTarget(key)
    if (kind === 'chat') {
      const c = chats.chats.find((x) => x.record.id === id)
      const pid = c && placeOf(c.record.workspaceId).project?.id
      if (c && pid !== undefined) goTo(pid, c.record.workspaceId, id)
      return
    }
    setMode('normal')
    if (kind === 'project') store.select(id, null)
    else {
      const w = catalog.workspaces.find((x) => x.id === id)
      if (w) store.select(w.projectId, w.id)
    }
  }

  const setupAction = async (what: 'edit' | 'run' | 'chat') => {
    if (ws === undefined) return
    try {
      if (what === 'edit') await invoke('edit_setup_script', { projectId: ws.projectId })
      else if (what === 'run') selectTab(ws.id, await runSetup(ws))
      else {
        const script = await invoke<string>('ensure_setup_script', { projectId: ws.projectId })
        newChat(ws, SETUP_PROMPT(script))
      }
      void setup.refresh()
    } catch (error) {
      const failed = {
        chat: "Couldn't create the setup script",
        edit: "Couldn't open the setup script",
        run: "Couldn't run the setup script",
      }[what]
      fail(failed)(error)
    }
  }

  const openFile = (file: FileChange) => {
    setGitFile(file)
    setMode('git')
  }
  /** A turn footer's file chip: git mode on that file, or on the whole diff (`null`). */
  const openChangedFile = (path: string | null) => {
    const file = changes?.find((c) => c.path === path)
    if (file) setGitFile(file)
    setMode('git')
  }

  const topBar = (title: string | undefined, gitOpen: boolean | null, tabsRow?: ReactNode) => (
    <TopBar
      title={title}
      place={mode === 'normal' ? ws?.name : undefined}
      sideOpen={layout.sideOpen}
      gitOpen={gitOpen}
      canDiff={ws !== undefined && mode !== 'settings'}
      noChanges={mode === 'normal' && changes?.length === 0}
      gitMode={mode === 'git'}
      onShowSide={() => update({ sideOpen: true })}
      onToggleGit={() => update({ gitOpen: !layout.gitOpen })}
      onGitMode={() => setMode((m) => (m === 'git' ? 'normal' : 'git'))}
      tools={<UpdateButton update={appUpdate} />}
    >
      {tabsRow}
    </TopBar>
  )
  const hostBar = host.state.kind === 'blocked' && (
    <HostBar lose={host.state.lose} onRestart={host.restart} />
  )
  // A failure: bottom right of the pane in front, never over the git panel; over a chat, just
  // above its composer (and its question), never on them.
  const toastsAt = (className?: string) =>
    notice !== null && (
      <NoticeToast
        key={`${notice.title}\n${notice.text}`}
        notice={notice}
        className={className}
        onClose={() => setNotice(null)}
      />
    )
  const toasts = toastsAt()
  const toastsOverChat = toastsAt('bottom-full mb-4')
  // A chat asking from elsewhere never covers the one you read: docked at the foot of the
  // sidebar (8px inside it, 8px clear of the foot's hairline), or, the sidebar hidden, at the
  // top right of the pane, 8px under its bars.
  const attentionToast = attention && (
    <AttentionToast
      key={attention.chatId}
      attention={attention}
      keyed={!questionHere}
      className={
        layout.sideOpen
          ? 'right-2 bottom-full left-2 mb-[9px] w-auto max-w-none'
          : 'top-full bottom-auto mt-2'
      }
      onOpen={() => goTo(attention.projectId, attention.workspaceId, attention.chatId)}
      onClose={() => setAttention(null)}
    />
  )
  /** The pane's top bar, the restart bar under it, and the attention toast under both. */
  const bars = (bar: ReactNode) => (
    <div className="relative flex flex-none flex-col">
      {bar}
      {hostBar}
      {!layout.sideOpen && attentionToast}
    </div>
  )
  const pageTitle = {
    git: `${ws?.name ?? ''} · Diff`,
    normal: undefined,
    settings: 'Settings',
  }[mode]

  const sideWidth = layout.sideWidth === null ? SIDE_WIDTH : `${layout.sideWidth}px`
  const gitWidth = layout.gitWidth === null ? GIT_WIDTH : `${layout.gitWidth}px`

  return (
    <div className="relative h-full">
      <div className="flex h-full">
        <Slide open={layout.sideOpen} width={`calc(${sideWidth} + 1px)`}>
          <Sidebar
            width={sideWidth}
            page={mode === 'settings' ? mode : null}
            foot={<Quotas cache={quotas.cache} error={quotas.error} />}
            dock={layout.sideOpen && attentionToast}
            projects={projects}
            workspaces={workspaces}
            signals={signals}
            diffs={diffs}
            chats={sidebarChats}
            projectId={projectId}
            workspaceId={ws?.id ?? null}
            onSelect={(pid, wid) => {
              setMode('normal')
              store.select(pid, wid)
            }}
            onProjects={() => setOverlay('projects')}
            onNewProject={() => void newProject()}
            onNewWorkspace={setComposeIn}
            onMenu={rowMenu}
            renamingId={renamingWs}
            onRename={(w) => setRenamingWs(w.id)}
            onRenamed={(w, name) => {
              setRenamingWs(null)
              if (name === null || name === w.name) return
              store.renameWorkspace(w.id, name).catch(fail(`Couldn't rename ${w.name}`))
            }}
            inbox={{
              done: inbox.filter((e) => e.kind === 'done').length,
              waiting: inbox.filter((e) => e.kind === 'waiting').length,
            }}
            onInbox={setInboxAt}
            onSettings={() => setMode((m) => (m === 'settings' ? 'normal' : 'settings'))}
            onHide={() => update({ sideOpen: false })}
          />
          <Splitter
            label="Resize the projects sidebar"
            value={layout.sideWidth ?? sideWidthNow()}
            min={LIMITS.side[0]}
            max={LIMITS.side[1]}
            direction={1}
            onChange={(next) => update({ sideWidth: next })}
          />
        </Slide>
        <div className="relative flex min-w-0 flex-1 flex-col">
          {mode !== 'normal' && toasts}
          {mode !== 'normal' && bars(topBar(pageTitle, null))}
          <div className="flex min-h-0 flex-1">
            {mode === 'normal' && (
              <>
                <main className="relative flex min-h-0 min-w-[360px] flex-1 flex-col">
                  {bars(
                    topBar(
                      undefined,
                      ws === undefined ? null : layout.gitOpen,
                      ws !== undefined && (
                        <TabBar
                          items={tabItems}
                          activeId={active?.id}
                          armedId={armed}
                          renamingId={renaming}
                          onSelect={(item) => selectTab(ws.id, item.id)}
                          onClose={(item) => requestClose(item.id)}
                          onMenu={tabMenu}
                          onRename={(item) => setRenaming(item.id)}
                          onRenamed={(item, title) => {
                            setRenaming(null)
                            const tell = renameTells.current === item.id
                            renameTells.current = null
                            if (title === null || title === item.title) return
                            if (!item.chat) terminals.rename(item.id, title)
                            else {
                              chats.rename(item.id, title)
                              if (tell) chats.send(item.id, `/rename ${title}`)
                            }
                          }}
                          onNew={(at) => {
                            setMenuAt(at)
                            setOverlay('new-tab')
                          }}
                        />
                      )
                    )
                  )}
                  {chat && (
                    <ChatView
                      above={toastsOverChat}
                      id={chat.record.id}
                      cwd={chat.cwd}
                      state={chat.state}
                      agent={agentOf(chat)}
                      models={models}
                      onAgent={(next, typed) => setAgent(chat, next, typed)}
                      blocked={host.state.kind === 'blocked'}
                      commands={availableCommands(chat.state.commands, appWideCommands)}
                      onSend={(text, images) => chats.send(chat.record.id, text, images)}
                      onCommand={(name, args) => runCommand(chat, name, args)}
                      onAnswer={(p, choice, answers) =>
                        chats.answer(chat.record.id, p, choice, answers)
                      }
                      onInterrupt={() => chats.interrupt(chat.record.id)}
                      onOpenFile={openChangedFile}
                      place={ws?.name}
                    />
                  )}
                  {term && <TerminalView tabId={term.id} attach={terminals.attach} />}
                  {ws === undefined && (
                    <div className={QUIET}>
                      <span className={EMPTY_TITLE}>{project?.name ?? 'No project'}</span>
                      <span className="text-base">Every piece of work gets its own worktree.</span>
                      <Button
                        variant="secondary"
                        className="h-8"
                        onClick={() => projectId !== null && setComposeIn(projectId)}
                      >
                        New workspace
                        <Kbd>⌘N</Kbd>
                      </Button>
                    </div>
                  )}
                  {ws !== undefined && active === undefined && (
                    // No tab yet: the chat composer itself, focused; the first Enter makes
                    // the chat, on the model picked here (the one new chats start on).
                    <ChatView
                      above={toastsOverChat}
                      id={`draft:${ws.id}`}
                      cwd={ws.path}
                      place={ws.name}
                      state={DRAFT}
                      agent={selection}
                      models={models}
                      onAgent={(next) => setSelection(next)}
                      blocked={host.state.kind === 'blocked'}
                      commands={appWideCommands}
                      onSend={(text, images) => {
                        if (host.state.kind === 'ready') newChat(ws, text, images)
                        else setNotice({ text: HOST_BLOCKED, title: "Couldn't start a chat" })
                      }}
                      onCommand={() => createTab('chat')}
                      onAnswer={() => {}}
                      onInterrupt={() => {}}
                      intro={
                        <>
                          Enter starts a chat in this worktree.{' '}
                          <button
                            type="button"
                            className="hover:text-foreground underline decoration-(--line-strong) underline-offset-2 transition-[color] duration-120"
                            onClick={() => createTab('terminal')}
                          >
                            Open a terminal
                          </button>{' '}
                          <Kbd>⇧⌘T</Kbd>
                        </>
                      }
                    />
                  )}
                  {mode === 'normal' && !chat && active !== undefined && toasts}
                  {ws === undefined && toasts}
                </main>
                <Slide open={layout.gitOpen && ws !== undefined} width={`calc(${gitWidth} + 1px)`}>
                  {ws !== undefined && (
                    <>
                      <Splitter
                        label="Resize the git panel"
                        value={layout.gitWidth ?? gitWidthNow()}
                        min={LIMITS.git[0]}
                        max={LIMITS.git[1]}
                        direction={-1}
                        onChange={(gitWidth) => update({ gitWidth })}
                      />
                      <GitPanel
                        width={gitWidth}
                        path={ws.path}
                        changes={changes}
                        pr={git.pr}
                        branch={git.branch}
                        cleanup={cleanup}
                        onOpenFile={openFile}
                        onChanged={git.refresh}
                        onError={(title, error) => fail(title)(error)}
                        claude={claudeHere}
                        onAskPr={() => askForPr(ws)}
                        setup={
                          <SetupSection
                            status={setup.status}
                            workspace={ws}
                            projectName={project?.name ?? ''}
                            run={setupTab ? { running: setupTab.exited === undefined } : null}
                            onShowRun={() => setupTab && selectTab(ws.id, setupTab.id)}
                            onEdit={() => void setupAction('edit')}
                            onRun={() => void setupAction('run')}
                            onAgent={() => void setupAction('chat')}
                          />
                        }
                      />
                    </>
                  )}
                </Slide>
              </>
            )}
            {mode === 'git' && ws !== undefined && (
              <GitMode
                path={ws.path}
                changes={changes ?? []}
                file={changes?.find((f) => f.path === gitFile?.path)}
                onSelect={setGitFile}
              />
            )}
            {mode === 'git' && ws === undefined && (
              <div className={QUIET}>No workspace selected</div>
            )}
            {mode === 'settings' && (
              <SettingsView
                chats={chats.chats.filter((c) => c.state.status === 'working').length}
                terminals={terminals.tabs.filter((t) => t.exited === undefined).length}
                onRestartHost={host.restart}
                update={appUpdate}
              />
            )}
          </div>
        </div>
      </div>

      {composeIn !== null && (
        <NewWorkspace
          projects={projects}
          projectId={composeIn}
          selection={selection}
          models={models}
          onSelection={setSelection}
          onCreate={startWork}
          onClose={() => setComposeIn(null)}
        />
      )}
      {inboxAt && (
        <Inbox
          entries={inbox}
          at={inboxAt}
          projectId={projectId}
          onClose={() => setInboxAt(null)}
          onOpen={(entry) => goTo(entry.projectId, entry.workspaceId, entry.tabId)}
        />
      )}
      {ctxMenu && <ContextMenu menu={ctxMenu} onClose={() => setCtxMenu(null)} />}
      {overlay === 'projects' && (
        <Picker
          title="Go to a workspace, chat or project"
          items={searchItems()}
          filterable
          onClose={() => setOverlay(null)}
          onPick={goToItem}
        />
      )}
      {commandPick?.name === 'resume' && project && ws && (
        <ResumePicker
          projectId={project.id}
          mainPath={project.path}
          workspaces={workspaces[project.id] ?? []}
          currentPath={ws.path}
          currentSession={pickFor?.record.sessionId ?? null}
          openSessions={Object.fromEntries(
            chats.chats.flatMap((c) =>
              c.record.sessionId === null ? [] : [[c.record.sessionId, c.record.title]]
            )
          )}
          initialQuery={commandPick.args}
          onPick={resume}
          onClose={() => setCommandPick(null)}
        />
      )}
      {overlay === 'new-tab' && (
        <Picker
          title={`New tab in ${ws?.name ?? 'this workspace'}`}
          items={NEW_TAB}
          filterable={false}
          anchor={menuAt ?? undefined}
          onClose={() => setOverlay(null)}
          onPick={createTab}
        />
      )}
    </div>
  )
}
