import { invoke } from '@tauri-apps/api/core'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { revealItemInDir } from '@tauri-apps/plugin-opener'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'

import { ChatView } from './app/chat-view'
import { ContextMenu, type MenuItem, type MenuState } from './app/context-menu'
import { GitMode } from './app/git-mode'
import { GitPanel } from './app/git-panel'
import { Icon } from './app/icons'
import { Inbox } from './app/inbox'
import { NewWorkspace } from './app/new-workspace'
import { Picker, type PickerItem } from './app/picker'
import { Quotas } from './app/quotas'
import { SettingsView } from './app/settings-view'
import { SetupSection } from './app/setup-section'
import { type DiffStat, type RowMenu, Sidebar } from './app/sidebar'
import { Splitter } from './app/splitter'
import { StatsView } from './app/stats-view'
import { TabBar, type TabItem } from './app/tab-bar'
import { TerminalView } from './app/terminal-view'
import { TopBar } from './app/top-bar'
import { useChats } from './app/use-chats'
import { useDaemon } from './app/use-daemon'
import { type FileChange, useGit } from './app/use-git'
import { LIMITS, useLayout } from './app/use-layout'
import { useModels } from './app/use-models'
import { useQuotas } from './app/use-quotas'
import { useSetup } from './app/use-setup'
import { chatFlags, type ChatSettings, DEFAULT_CHAT, normalize } from './model/agents'
import { isWorktree, signalOf, tabsOf, worktreesOf } from './model/catalog'
import { inboxOf } from './model/inbox'

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

const plural = (n: number) => `${n} ${n === 1 ? 'tab' : 'tabs'}`

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
  const daemon = useDaemon()
  const { projectId, projects, session, status, tabsByProject, workspaces } = daemon
  const [mode, setMode] = useState<'normal' | 'git' | 'stats' | 'settings'>('normal')
  const [overlay, setOverlay] = useState<'projects' | 'new-tab' | null>(null)
  // Where the assistant menu drops from; null opens it as a palette (⇧⌘T).
  const [menuAt, setMenuAt] = useState<{ left: number; top: number } | null>(null)
  const models = useModels()
  const [stored, setSelectionState] = useState(readChatSettings)
  // What was picked under an older model list falls back to what this one offers.
  const selection = normalize(stored, models)
  const [composeIn, setComposeIn] = useState<string | null>(null)
  const [ctxMenu, setCtxMenu] = useState<MenuState | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [inboxAt, setInboxAt] = useState<{ x: number; y: number } | null>(null)
  // A tab whose agent is working closes on the second ask: ⌘W twice, or × twice.
  const [armed, setArmed] = useState<string | null>(null)
  const keys = useRef({
    close: () => {},
    compose: () => {},
    newTab: (_kind: 'chat' | 'terminal') => {},
  })
  const [gitFile, setGitFile] = useState<FileChange>()
  const [notice, setNotice] = useState<string | null>(null)
  const chats = useChats()
  const [chatId, setChatId] = useState<string | null>(null)

  const all = useMemo(
    () => (projectId === null ? undefined : workspaces[projectId]) ?? [],
    [projectId, workspaces]
  )
  const worktrees = useMemo(() => worktreesOf(workspaces), [workspaces])
  const list = all.filter(isWorktree)
  const ws = list.find((w) => w.id === daemon.workspaceId) ?? list[0]
  // Matched against every workspace, so the main checkout's tabs never leak into a worktree.
  const tabs = useMemo(() => (ws ? tabsOf(session.tabs, ws, all) : []), [all, session.tabs, ws])
  const tab = tabs.find((t) => t.id === daemon.activeTabId) ?? tabs[0]
  const wsChats = chats.chats.filter((c) => c.cwd === ws?.path)
  const chat = wsChats.find((c) => c.id === chatId)

  const paths = useMemo(
    () => [...new Set(Object.values(worktrees).flatMap((l) => l.flatMap((w) => w.path ?? [])))],
    [worktrees]
  )
  const git = useGit(ws?.path, paths)
  const quotas = useQuotas()
  const { layout, update } = useLayout()
  const setup = useSetup(projectId)
  const changes = ws?.path === undefined ? undefined : git.changes[ws.path]
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
      else if (tabs[index - 1] !== undefined && index >= 1) {
        setChatId(null)
        daemon.selectTab(tabs[index - 1]?.id ?? null)
      } else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [daemon, layout.gitOpen, layout.sideOpen, tabs, update])

  // No browser menu (Reload, Inspect…): rows bring their own; text fields keep Copy and Paste.
  useEffect(() => {
    const onMenu = (e: MouseEvent) => {
      const editable =
        e.target instanceof HTMLElement && e.target.closest('input, textarea') !== null
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
      await daemon.createProject(path)
      // The first project boots the app: start over on it.
      if (status.kind === 'no-projects') window.location.reload()
    } catch (error) {
      setNotice(String(error))
    }
  }

  if (status.kind === 'no-projects') {
    return (
      <main className="splash">
        <div className="quiet fill">
          <span>No projects yet</span>
          <button type="button" className="btn btn-primary" onClick={() => void newProject()}>
            Open a folder
          </button>
        </div>
      </main>
    )
  }

  if (status.kind === 'loading' || status.kind === 'error') {
    const message = {
      error: status.kind === 'error' ? status.message : '',
      loading: 'Connecting to aimux…',
    }[status.kind]
    return <main className="splash">{message}</main>
  }

  const setSelection = (next: ChatSettings) => {
    setSelectionState(next)
    try {
      localStorage.setItem(CHAT_SETTINGS, JSON.stringify(next))
    } catch {
      // Remembering the choice is a convenience; chats then open on the defaults.
    }
  }

  /** A chat (with the last model and effort picked) or a shell, in this workspace. */
  const createTab = (kind: string) => {
    setOverlay(null)
    if (kind === 'chat') {
      if (ws?.path === undefined) setNotice('A chat needs a workspace folder.')
      else setChatId(chats.create(ws.path, chatFlags(selection)))
      return
    }
    setChatId(null)
    daemon
      .createTab({ assistant: 'terminal', effort: '', model: '' }, ws?.id ?? null)
      .catch((error: unknown) => setNotice(String(error)))
  }

  /** The composer's Create: a worktree, a chat in it, and the prompt as its first message. */
  const startWork = async (pid: string, name: string, base: string | null, prompt: string) => {
    setMode('normal')
    const created = await daemon.createWorkspace(pid, name, base)
    if (created.path === undefined) throw new Error('The workspace has no folder to chat in.')
    const id = chats.create(created.path, chatFlags(selection))
    setChatId(id)
    if (prompt !== '') chats.send(id, prompt)
  }

  const rowMenu = (row: RowMenu) => {
    const path = row.kind === 'project' ? row.project.projectPath : row.workspace.path
    const items: MenuItem[] = []
    if (row.kind === 'project')
      items.push({ label: 'New workspace…', run: () => setComposeIn(row.project.id) })
    if (path !== undefined) {
      items.push({ label: 'Show in Finder', run: async () => revealItemInDir(path) })
      items.push({ label: 'Copy path', run: () => copy(path) })
    }
    if (row.kind === 'workspace' && row.workspace.branch !== undefined) {
      const branch = row.workspace.branch
      items.push({ label: 'Copy branch name', run: () => copy(branch) })
    }
    if (row.kind === 'project') {
      items.push('separator', {
        confirm: {
          button: 'Close project',
          text: `Close ${row.project.name}? It leaves aimux; its folder and worktrees stay on disk.`,
        },
        danger: true,
        label: 'Close project…',
        run: async () => daemon.closeProject(row.project.id),
      })
    }
    const { project: owner, workspace } =
      row.kind === 'workspace' ? row : { project: row.project, workspace: null }
    // The primary checkout is the project itself: it has no worktree to delete.
    if (workspace !== null && workspace.id !== null && workspace.source !== 'primary') {
      const wid = workspace.id
      const branch = workspace.branch === undefined ? '' : ` The branch ${workspace.branch} stays.`
      items.push('separator', {
        confirm: {
          button: 'Delete',
          text: `Delete ${workspace.name}? Its tabs close and its worktree folder is removed.${branch}`,
        },
        danger: true,
        label: 'Delete workspace…',
        retry: {
          button: 'Delete anyway',
          run: async () => daemon.removeWorkspace(owner.id, wid, true),
          text: `${workspace.name} has uncommitted changes. Deleting it anyway discards them.`,
          when: (error) => /modified|untracked|--force/.test(error),
        },
        run: async () => daemon.removeWorkspace(owner.id, wid, false),
      })
    }
    setCtxMenu({ items, x: row.x, y: row.y })
  }

  const requestClose = (id: string) => {
    const chatTab = wsChats.find((c) => c.id === id)
    const busy = chatTab
      ? chatTab.state.status === 'working'
      : signalOf(
          tabs.filter((t) => t.id === id),
          daemon.done
        ) === 'working'
    if (busy && armed !== id) {
      setArmed(id)
      return
    }
    setArmed(null)
    if (chatTab) {
      chats.close(id)
      if (id === chatId) setChatId(null)
    } else daemon.closeTab(id)
  }

  keys.current = {
    close: () => {
      const id = chat?.id ?? tab?.id
      if (id !== undefined && mode === 'normal') requestClose(id)
    },
    compose: () => projectId !== null && setComposeIn(projectId),
    newTab: (kind: 'chat' | 'terminal') => createTab(kind),
  }

  // After a merge, the worktree that carried the branch is dead weight.
  let cleanup: { label: string; run: () => Promise<void> } | null = null
  if (ws !== undefined && ws.id !== null && projectId !== null) {
    const [pid, wid] = [projectId, ws.id]
    cleanup = { label: 'Delete workspace', run: async () => daemon.removeWorkspace(pid, wid, true) }
  }

  const inbox = inboxOf(projects, workspaces, tabsByProject, daemon.done)

  const tabItems: TabItem[] = [
    ...tabs.map((t) => ({
      chat: false,
      id: t.id,
      signal: signalOf([t], daemon.done),
      title: t.title,
    })),
    ...wsChats.map((c) => ({
      chat: true,
      id: c.id,
      signal: c.state.status === 'working' ? ('working' as const) : null,
      title: c.title,
    })),
  ]

  const tabMenu = (item: TabItem, x: number, y: number) =>
    setCtxMenu({
      items: [
        { label: 'Rename', run: () => setRenaming(item.id) },
        { label: 'Close', run: () => requestClose(item.id) },
      ],
      x,
      y,
    })

  const openAttention = () => {
    const hit = daemon.attention
    if (!hit) return
    const hitList = worktrees[hit.projectId] ?? []
    const hitTab = tabsByProject[hit.projectId]?.find((t) => t.id === hit.tabId)
    const wid = hitList.find((w) => w.id === hitTab?.workspaceId)?.id ?? hitList[0]?.id ?? null
    daemon.selectWorkspace(hit.projectId, wid, hit.tabId)
  }

  const projectItems: PickerItem[] = projects.map((p) => ({
    key: p.id,
    label: p.name,
    meta: plural(tabsByProject[p.id]?.length ?? 0),
    sub: p.projectPath,
  }))

  /** Edit opens the script; Run and Agent open a tab in this workspace and focus it. */
  const runSetup = async (command: 'edit_setup_script' | 'run_setup' | 'setup_agent') => {
    if (projectId === null) return
    try {
      const tabId = await invoke<string | null>(command, {
        assistant: 'claude',
        projectId,
        workspaceId: ws?.id ?? null,
      })
      void setup.refresh()
      if (typeof tabId === 'string') daemon.selectTab(tabId)
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
      gitMode={mode === 'git'}
      onShowSide={() => update({ sideOpen: true })}
      onToggleGit={() => update({ gitOpen: !layout.gitOpen })}
      onGitMode={() => setMode((m) => (m === 'git' ? 'normal' : 'git'))}
    >
      {tabsRow}
    </TopBar>
  )
  const pageTitle = {
    git: `${ws?.name ?? ''} · Diff`,
    normal: undefined,
    settings: 'Settings',
    stats: 'Stats',
  }[mode]

  return (
    <div className="app">
      <div className="cols">
        {layout.sideOpen && (
          <>
            <Sidebar
              width={layout.sideWidth}
              page={mode === 'stats' || mode === 'settings' ? mode : null}
              connected={status.kind === 'ready'}
              foot={<Quotas cache={quotas.cache} error={quotas.error} />}
              projects={projects}
              workspaces={worktrees}
              tabsByProject={tabsByProject}
              done={daemon.done}
              diffs={diffs}
              projectId={projectId}
              workspaceId={ws?.id ?? null}
              onSelect={(pid, wid) => {
                setMode('normal')
                daemon.selectWorkspace(pid, wid)
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
              onStats={() => setMode((m) => (m === 'stats' ? 'normal' : 'stats'))}
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
          <div className="work">
            {mode === 'normal' && (
              <>
                <main className="center">
                  {topBar(
                    ws?.name,
                    layout.gitOpen,
                    <TabBar
                      items={tabItems}
                      activeId={chat?.id ?? tab?.id}
                      armedId={armed}
                      renamingId={renaming}
                      onSelect={(item) => {
                        if (item.chat) setChatId(item.id)
                        else {
                          setChatId(null)
                          daemon.selectTab(item.id)
                        }
                      }}
                      onClose={(item) => requestClose(item.id)}
                      onMenu={tabMenu}
                      onRename={(item) => setRenaming(item.id)}
                      onRenamed={(item, title) => {
                        setRenaming(null)
                        if (title === null || title === item.title) return
                        if (item.chat) chats.rename(item.id, title)
                        else daemon.renameTab(item.id, title)
                      }}
                      onNew={(at) => {
                        setMenuAt(at)
                        setOverlay('new-tab')
                      }}
                    />
                  )}
                  {chat && (
                    <ChatView
                      cwd={chat.cwd}
                      state={chat.state}
                      onSend={(text) => chats.send(chat.id, text)}
                      onAnswer={(p, choice) => chats.answer(chat.id, p, choice)}
                      onInterrupt={() => chats.interrupt(chat.id)}
                    />
                  )}
                  {!chat && tab && (
                    <TerminalView
                      tabId={tab.id}
                      viewport={session.viewports[tab.id]}
                      write={daemon.write}
                      scroll={daemon.scroll}
                      scrollToBottom={daemon.scrollToBottom}
                      resize={daemon.resize}
                    />
                  )}
                  {ws === undefined && (
                    <div className="quiet fill">
                      <span className="empty-title">
                        No workspace in{' '}
                        {projects.find((p) => p.id === projectId)?.name ?? 'this project'} yet
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
                  {ws !== undefined && !chat && !tab && (
                    <div className="quiet fill">
                      <span>No tabs in {ws?.name ?? 'this workspace'}</span>
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
                      path={ws?.path}
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
                          workspaceId={ws?.id ?? null}
                          workspaceName={ws?.name ?? ''}
                          onEdit={() => void runSetup('edit_setup_script')}
                          onRun={() => void runSetup('run_setup')}
                          onAgent={() => void runSetup('setup_agent')}
                        />
                      }
                    />
                  </>
                )}
              </>
            )}
            {mode === 'git' && ws?.path !== undefined && (
              <GitMode
                path={ws.path}
                changes={changes ?? []}
                file={changes?.find((f) => f.path === gitFile?.path)}
                onSelect={setGitFile}
                onExit={() => setMode('normal')}
              />
            )}
            {mode === 'git' && ws?.path === undefined && (
              <div className="quiet fill">Not a git repository</div>
            )}
            {mode === 'stats' && <StatsView quotas={quotas.cache} />}
            {mode === 'settings' && <SettingsView />}
          </div>
        </div>
      </div>

      {daemon.attention && (
        <div className="toast" role="status">
          <div className="toast-body">
            <span className="toast-title">
              <span className="st st-waiting" />
              {daemon.attention.title} is waiting for you
            </span>
            <span className="toast-text">{daemon.attention.projectName}</span>
            <div className="toast-actions">
              <button type="button" className="btn btn-ink" onClick={openAttention}>
                Open tab
              </button>
              <button type="button" className="btn btn-outline" onClick={daemon.dismissAttention}>
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
          takenNames={(pid) => (workspaces[pid] ?? []).map((w) => w.name)}
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
          onOpen={(entry) => {
            setMode('normal')
            setChatId(null)
            daemon.selectWorkspace(entry.projectId, entry.workspaceId, entry.tabId)
          }}
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
            daemon.selectWorkspace(pid, worktrees[pid]?.[0]?.id ?? null)
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
