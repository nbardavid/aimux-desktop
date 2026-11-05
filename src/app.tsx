import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification'
import { revealItemInDir } from '@tauri-apps/plugin-opener'
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ChatView } from './app/chat-view'
import { ContextMenu, type MenuItem, type MenuState } from './app/context-menu'
import { GitMode } from './app/git-mode'
import { GitPanel } from './app/git-panel'
import { HostBar } from './app/host-bar'
import { Icon } from './app/icons'
import { Inbox } from './app/inbox'
import { NewWorkspace } from './app/new-workspace'
import { Picker, type PickerItem } from './app/picker'
import { Quotas } from './app/quotas'
import { resumeTarget, type Session } from './app/resume'
import { ResumePicker } from './app/resume-picker'
import { SettingsView } from './app/settings-view'
import { SetupSection } from './app/setup-section'
import { type DiffStat, type RowMenu, Sidebar } from './app/sidebar'
import { Splitter } from './app/splitter'
import { TabBar, type TabItem } from './app/tab-bar'
import { TerminalView } from './app/terminal-view'
import { TopBar } from './app/top-bar'
import { UpdateButton, useUpdate } from './app/update-button'
import { useCatalog } from './app/use-catalog'
import { chatSignal, type ChatTab, useChats } from './app/use-chats'
import { type FileChange, useGit } from './app/use-git'
import { HOST_BLOCKED, useHost } from './app/use-host'
import { LIMITS, useLayout } from './app/use-layout'
import { useModels } from './app/use-models'
import { useQuotas } from './app/use-quotas'
import { useSetup } from './app/use-setup'
import { useTerminals } from './app/use-terminals'
import { availableCommands } from './chat/commands'
import { chatFlags, type ChatSettings, DEFAULT_CHAT, effortLabel, normalize } from './model/agents'
import { byProject, strongest, type Workspace } from './model/catalog'
import { inboxOf } from './model/inbox'
import { nameCandidates } from './model/names'

// What a new tab can be, as in Conductor: a native Claude chat, or a shell.
const NEW_TAB: PickerItem[] = [
  { key: 'chat', label: 'Chat', meta: '⌘T' },
  { key: 'terminal', label: 'Terminal', meta: '⇧⌘T' },
]

const CHAT_SETTINGS = 'aimux.chat'

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

const plural = (n: number) => `${n} ${n === 1 ? 'workspace' : 'workspaces'}`

const SETUP_PROMPT = (script: string) =>
  `Write the setup script at ${script}. It runs in every new git worktree of this project, ` +
  'from the worktree root, to install what a fresh checkout lacks: dependencies, .env files ' +
  'copied from the main checkout, caches. Replace the stub; keep `#!/usr/bin/env bash` and ' +
  '`set -euo pipefail`. Make it idempotent and non-interactive, use no secrets, exit ' +
  'non-zero on failure. Do not run it.'

/** An app command's picker: `/resume` as a palette, `/model` and `/effort` over the composer. */
interface CommandPick {
  name: 'resume' | 'model' | 'effort'
  chatId: string
  args: string
}

/** Just above the chat's composer, for the pickers its commands open. */
function overComposer() {
  const box = document.querySelector('.composer')?.getBoundingClientRect()
  return box ? { bottom: window.innerHeight - box.top + 6, left: box.left } : undefined
}

/** A chat asking for you while you look elsewhere. */
interface Attention {
  chatId: string
  projectId: string
  workspaceId: string
  title: string
  where: string
}

async function notify(body: string): Promise<void> {
  const granted = (await isPermissionGranted()) || (await requestPermission()) === 'granted'
  if (granted) sendNotification({ body, title: 'aimux' })
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
    close: () => {},
    compose: () => {},
    newTab: (_kind: 'chat' | 'terminal') => {},
  })
  const [gitFile, setGitFile] = useState<FileChange>()
  const [notice, setNotice] = useState<string | null>(null)
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
    onAttention: (chat: ChatTab, kind) => {
      if (watching.current === chat.record.id) return
      const { project: p, workspace: w } = placeRef.current(chat.record.workspaceId)
      if (!p || !w) return
      void (async () => {
        if (!(await getCurrentWindow().isFocused())) {
          await notify(
            `${chat.record.title} ${kind === 'waiting' ? 'is waiting for you' : 'is done'}`
          )
        } else if (kind === 'waiting') {
          setAttention({
            chatId: chat.record.id,
            projectId: p.id,
            title: chat.record.title,
            where: `${p.name} · ${w.name}`,
            workspaceId: w.id,
          })
        }
      })()
    },
    onRecord: store.saveChat,
  })

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
  const chat = active?.chat === true ? wsChats.find((c) => c.record.id === active.id) : undefined
  const term = active?.chat === false ? wsTerms.find((t) => t.id === active.id) : undefined

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
      if (!e.metaKey) return
      const index = Number(e.key)
      // e.code: with Option held, e.key is the composed character.
      if (e.code === 'KeyB' && e.altKey) update({ gitOpen: !layout.gitOpen })
      else if (e.code === 'KeyB') update({ sideOpen: !layout.sideOpen })
      else if (e.key === 'p') setOverlay('projects')
      else if (e.key.toLowerCase() === 't') keys.current.newTab(e.shiftKey ? 'terminal' : 'chat')
      else if (e.key === 'w') keys.current.close()
      else if (e.key === 'n') keys.current.compose()
      else if (e.key === 'g') setMode((m) => (m === 'git' ? 'normal' : 'git'))
      else if (index >= 1 && tabItems[index - 1] !== undefined && ws !== undefined) {
        selectTab(ws.id, tabItems[index - 1]?.id ?? '')
      } else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

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

  useEffect(() => {
    if (notice === null) return
    const timer = setTimeout(() => setNotice(null), 6000)
    return () => clearTimeout(timer)
  }, [notice])

  const newProject = async () => {
    const path = await openDialog({ directory: true, title: 'Open a folder as a project' })
    if (typeof path !== 'string') return
    try {
      await store.addProject(path)
      setMode('normal')
    } catch (error) {
      setNotice(String(error))
    }
  }

  if (status.kind !== 'ready') {
    return <main className="splash">{status.kind === 'error' ? status.message : 'Opening…'}</main>
  }

  if (projects.length === 0) {
    return (
      <main className="splash">
        <div className="quiet fill">
          <span className="empty-title">Open a repository to start</span>
          <span>Each piece of work then gets its own worktree, with its chats and terminals.</span>
          <button type="button" className="btn btn-ink" onClick={() => void newProject()}>
            Open a folder
          </button>
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

  const newChat = (w: Workspace, prompt?: string) => {
    const id = chats.create(w.id, w.path, chatFlags(selection))
    selectTab(w.id, id)
    if (prompt !== undefined && prompt !== '') chats.send(id, prompt)
    return id
  }

  /** A chat (with the last model and effort picked) or a shell, in this workspace. */
  const createTab = (kind: string) => {
    setOverlay(null)
    if (ws === undefined) return
    if (host.state.kind !== 'ready') setNotice(HOST_BLOCKED)
    else if (kind === 'chat') newChat(ws)
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
      const { branch } = row.workspace
      items.push({ label: 'Copy branch name', run: () => copy(branch) })
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
          text: `Delete ${w.name}? Its tabs close and its worktree folder is removed. The branch ${w.branch} stays.`,
        },
        danger: true,
        label: 'Delete workspace…',
        retry: {
          button: 'Delete anyway',
          run: async () => removeWorkspace(w, true),
          text: `${w.name} has uncommitted changes. Deleting it anyway discards them.`,
          when: (error) => /modified|untracked|--force/.test(error),
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
    if (chatTab) {
      chats.close(id)
      store.forgetChat(id)
    } else terminals.close(id)
  }

  keys.current = {
    close: () => {
      if (active !== undefined && mode === 'normal') requestClose(active.id)
    },
    compose: () => projectId !== null && setComposeIn(projectId),
    newTab: (kind: 'chat' | 'terminal') => createTab(kind),
  }

  // After a merge, the worktree that carried the branch is dead weight.
  const cleanup =
    ws === undefined
      ? null
      : { label: 'Delete workspace', run: async () => removeWorkspace(ws, true) }

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

  const modelOf = (c: ChatTab) => models.find((m) => m.value === (c.record.model || 'default'))

  /** The app's own `/` commands; Claude's others are sent as typed. */
  const runCommand = (c: ChatTab, name: string, args: string) => {
    const id = c.record.id
    const said = args.toLowerCase()
    if (name === 'clear') chats.clear(id)
    else if (name === 'rename' && args !== '') {
      chats.rename(id, args)
      chats.send(id, `/rename ${args}`)
    } else if (name === 'rename') {
      renameTells.current = id
      setRenaming(id)
    } else if (name === 'model') {
      const m = models.find((x) => x.value.toLowerCase() === said || x.name.toLowerCase() === said)
      if (m) chats.setModel(id, m.value)
      else setCommandPick({ args, chatId: id, name })
    } else if (name === 'effort') {
      const efforts = modelOf(c)?.efforts ?? []
      const level = efforts.find((e) => e === said || effortLabel(e).toLowerCase() === said)
      if (level !== undefined) chats.setEffort(id, level)
      else setCommandPick({ args, chatId: id, name })
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
  const commandItems = (): PickerItem[] => {
    if (!pickFor) return []
    const current = (on: boolean) => (on ? 'current' : undefined)
    if (commandPick?.name === 'model') {
      const model = modelOf(pickFor)?.value
      return models.map((m) => ({ key: m.value, label: m.name, meta: current(m.value === model) }))
    }
    return (modelOf(pickFor)?.efforts ?? []).map((e) => ({
      key: e,
      label: effortLabel(e),
      meta: current(e === pickFor.record.effort),
    }))
  }

  const tabMenu = (item: TabItem, x: number, y: number) =>
    setCtxMenu({
      items: [
        { label: 'Rename', run: () => setRenaming(item.id) },
        { label: 'Close', run: () => requestClose(item.id) },
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

  const projectItems: PickerItem[] = projects.map((p) => ({
    key: p.id,
    label: p.name,
    meta: plural(workspaces[p.id]?.length ?? 0),
    sub: p.path,
  }))

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
      setNotice(String(error))
    }
  }

  const openFile = (file: FileChange) => {
    setGitFile(file)
    setMode('git')
  }

  const topBar = (title: string | undefined, gitOpen: boolean | null, tabsRow?: ReactNode) => (
    <TopBar
      title={title}
      sideOpen={layout.sideOpen}
      gitOpen={gitOpen}
      canDiff={ws !== undefined}
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
  const pageTitle = {
    git: `${ws?.name ?? ''} · Diff`,
    normal: undefined,
    settings: 'Settings',
  }[mode]

  return (
    <div className="app">
      <div className="cols">
        {layout.sideOpen && (
          <>
            <Sidebar
              width={layout.sideWidth}
              page={mode === 'settings' ? mode : null}
              foot={<Quotas cache={quotas.cache} error={quotas.error} />}
              projects={projects}
              workspaces={workspaces}
              signals={signals}
              diffs={diffs}
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
              value={layout.sideWidth}
              min={LIMITS.side[0]}
              max={LIMITS.side[1]}
              direction={1}
              onChange={(sideWidth) => update({ sideWidth })}
            />
          </>
        )}
        <div className="main">
          {mode !== 'normal' && topBar(pageTitle, null)}
          {mode !== 'normal' && hostBar}
          <div className="work">
            {mode === 'normal' && (
              <>
                <main className="center">
                  {topBar(
                    ws?.name,
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
                  )}
                  {hostBar}
                  {chat && (
                    <ChatView
                      cwd={chat.cwd}
                      state={chat.state}
                      commands={availableCommands(chat.state.commands, appWideCommands)}
                      onSend={(text) => chats.send(chat.record.id, text)}
                      onCommand={(name, args) => runCommand(chat, name, args)}
                      onAnswer={(p, choice) => chats.answer(chat.record.id, p, choice)}
                      onInterrupt={() => chats.interrupt(chat.record.id)}
                    />
                  )}
                  {term && <TerminalView tabId={term.id} attach={terminals.attach} />}
                  {ws === undefined && (
                    <div className="quiet fill">
                      <span className="empty-title">
                        No workspace in {project?.name ?? 'this project'} yet
                      </span>
                      <span>
                        Each workspace is a worktree on its own branch, with its chats and
                        terminals.
                      </span>
                      <button
                        type="button"
                        className="btn btn-ink"
                        onClick={() => projectId !== null && setComposeIn(projectId)}
                      >
                        New workspace
                        <span className="kbd-ink">⌘N</span>
                      </button>
                    </div>
                  )}
                  {ws !== undefined && active === undefined && (
                    <div className="quiet fill">
                      <span>No tabs in {ws.name}</span>
                      <span className="empty-actions">
                        <button
                          type="button"
                          className="btn btn-soft"
                          onClick={() => createTab('chat')}
                        >
                          <Icon name="chat" small />
                          New chat
                        </button>
                        <button
                          type="button"
                          className="btn btn-soft"
                          onClick={() => createTab('terminal')}
                        >
                          Terminal
                        </button>
                      </span>
                    </div>
                  )}
                </main>
                {layout.gitOpen && ws !== undefined && (
                  <>
                    <Splitter
                      label="Resize the git panel"
                      value={layout.gitWidth}
                      min={LIMITS.git[0]}
                      max={LIMITS.git[1]}
                      direction={-1}
                      onChange={(gitWidth) => update({ gitWidth })}
                    />
                    <GitPanel
                      width={layout.gitWidth}
                      path={ws.path}
                      changes={changes}
                      pr={git.pr}
                      branch={git.branch}
                      cleanup={cleanup}
                      onOpenFile={openFile}
                      onChanged={git.refresh}
                      onError={setNotice}
                      setup={
                        <SetupSection
                          status={setup.status}
                          workspace={ws}
                          onEdit={() => void setupAction('edit')}
                          onRun={() => void setupAction('run')}
                          onAgent={() => void setupAction('chat')}
                        />
                      }
                    />
                  </>
                )}
              </>
            )}
            {mode === 'git' && ws !== undefined && (
              <GitMode
                path={ws.path}
                changes={changes ?? []}
                file={changes?.find((f) => f.path === gitFile?.path)}
                onSelect={setGitFile}
                onExit={() => setMode('normal')}
              />
            )}
            {mode === 'git' && ws === undefined && (
              <div className="quiet fill">No workspace selected</div>
            )}
            {mode === 'settings' && (
              <SettingsView
                terminals={terminals.tabs.filter((t) => t.exited === undefined).length}
                onRestartHost={host.restart}
              />
            )}
          </div>
        </div>
      </div>

      {attention && (
        <div className="toast" role="status">
          <div className="toast-body">
            <span className="toast-title">
              <span className="st st-waiting" />
              {attention.title} is waiting for you
            </span>
            <span className="toast-text">{attention.where}</span>
            <div className="toast-actions">
              <button
                type="button"
                className="btn btn-ink"
                onClick={() => {
                  goTo(attention.projectId, attention.workspaceId, attention.chatId)
                  setAttention(null)
                }}
              >
                Open chat
              </button>
              <button type="button" className="btn btn-outline" onClick={() => setAttention(null)}>
                Later
              </button>
            </div>
          </div>
        </div>
      )}
      {notice !== null && (
        <div className="toast" role="alert">
          <div className="toast-body">
            <span className="toast-title">That did not work</span>
            <span className="toast-text">{notice}</span>
          </div>
        </div>
      )}

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
          onClose={() => setInboxAt(null)}
          onOpen={(entry) => goTo(entry.projectId, entry.workspaceId, entry.tabId)}
        />
      )}
      {ctxMenu && <ContextMenu menu={ctxMenu} onClose={() => setCtxMenu(null)} />}
      {overlay === 'projects' && (
        <Picker
          title="Projects"
          items={projectItems}
          filterable
          onClose={() => setOverlay(null)}
          onPick={(pid) => {
            setOverlay(null)
            setMode('normal')
            store.select(pid, null)
          }}
        />
      )}
      {commandPick?.name === 'resume' && project && ws && (
        <ResumePicker
          projectId={project.id}
          mainPath={project.path}
          workspaces={workspaces[project.id] ?? []}
          currentPath={ws.path}
          initialQuery={commandPick.args}
          onPick={resume}
          onClose={() => setCommandPick(null)}
        />
      )}
      {commandPick !== null && commandPick.name !== 'resume' && pickFor && (
        <Picker
          title={commandPick.name === 'model' ? 'Model' : 'Intelligence'}
          items={commandItems()}
          filterable={false}
          anchor={overComposer()}
          empty="This model has no effort levels."
          onClose={() => setCommandPick(null)}
          onPick={(key) => {
            setCommandPick(null)
            if (commandPick.name === 'model') chats.setModel(pickFor.record.id, key)
            else chats.setEffort(pickFor.record.id, key)
          }}
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
