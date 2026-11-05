import { invoke } from '@tauri-apps/api/core'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { useEffect, useMemo, useState } from 'react'

import { GitMode } from './app/git-mode'
import { GitPanel } from './app/git-panel'
import { Icon } from './app/icons'
import { Picker, type PickerItem } from './app/picker'
import { Quotas } from './app/quotas'
import { SettingsView } from './app/settings-view'
import { SetupSection } from './app/setup-section'
import { type DiffStat, Sidebar } from './app/sidebar'
import { Splitter } from './app/splitter'
import { StatsView } from './app/stats-view'
import { TabBar } from './app/tab-bar'
import { TerminalView } from './app/terminal-view'
import { TopBar } from './app/top-bar'
import { useDaemon } from './app/use-daemon'
import { type FileChange, useGit } from './app/use-git'
import { LIMITS, useLayout } from './app/use-layout'
import { useQuotas } from './app/use-quotas'
import { useSetup } from './app/use-setup'
import { WorkspaceDialog } from './app/workspace-dialog'
import { tabsOf } from './model/catalog'

const ASSISTANTS: PickerItem[] = [
  { glyph: 'Cl', key: 'claude', label: 'Claude Code', sub: 'claude' },
  { glyph: 'Cx', key: 'codex', label: 'Codex', sub: 'codex' },
  { glyph: 'Oc', key: 'opencode', label: 'OpenCode', sub: 'opencode' },
  { glyph: '>_', key: 'terminal', label: 'Terminal', sub: 'your shell' },
]

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
  const [newWorkspaceIn, setNewWorkspaceIn] = useState<string | null>(null)
  const [gitFile, setGitFile] = useState<FileChange>()
  const [notice, setNotice] = useState<string | null>(null)

  const list = (projectId === null ? undefined : workspaces[projectId]) ?? []
  const ws = list.find((w) => w.id === daemon.workspaceId) ?? list[0]
  const tabs = ws ? tabsOf(session.tabs, ws, list) : session.tabs
  const tab = tabs.find((t) => t.id === daemon.activeTabId) ?? tabs[0]

  const paths = useMemo(
    () => [...new Set(Object.values(workspaces).flatMap((l) => l.flatMap((w) => w.path ?? [])))],
    [workspaces]
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
      else if (e.key === 't') setOverlay('new-tab')
      else if (e.key === 'g') setMode((m) => (m === 'git' ? 'normal' : 'git'))
      else if (tabs[index - 1] !== undefined && index >= 1)
        daemon.selectTab(tabs[index - 1]?.id ?? null)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [daemon, layout.gitOpen, layout.sideOpen, tabs, update])

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

  const createTab = (assistant: string) => {
    setOverlay(null)
    daemon.createTab(assistant, ws?.id ?? null).catch((error: unknown) => setNotice(String(error)))
  }

  const openAttention = () => {
    const hit = daemon.attention
    if (!hit) return
    const hitList = workspaces[hit.projectId] ?? []
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

  const project = projects.find((p) => p.id === projectId)
  const place = {
    git: ws?.branch ?? ws?.name,
    normal: ws?.branch ?? ws?.name,
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
              workspaces={workspaces}
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
              onNewWorkspace={setNewWorkspaceIn}
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
          <TopBar
            project={mode === 'stats' || mode === 'settings' ? undefined : project?.name}
            place={place}
            sideOpen={layout.sideOpen}
            gitOpen={layout.gitOpen}
            gitMode={mode === 'git'}
            onShowSide={() => update({ sideOpen: true })}
            onToggleGit={() => update({ gitOpen: !layout.gitOpen })}
            onGitMode={() => setMode((m) => (m === 'git' ? 'normal' : 'git'))}
          />
          <div className="work">
            {mode === 'normal' && (
              <>
                <main className="center">
                  <TabBar
                    tabs={tabs}
                    activeId={tab?.id}
                    done={daemon.done}
                    onSelect={daemon.selectTab}
                    onClose={daemon.closeTab}
                    onNew={() => setOverlay('new-tab')}
                  />
                  {tab ? (
                    <TerminalView
                      tabId={tab.id}
                      viewport={session.viewports[tab.id]}
                      write={daemon.write}
                      scroll={daemon.scroll}
                      scrollToBottom={daemon.scrollToBottom}
                      resize={daemon.resize}
                    />
                  ) : (
                    <div className="quiet fill">
                      <span>No tabs in {ws?.name ?? 'this workspace'}</span>
                      <button
                        type="button"
                        className="btn btn-soft"
                        onClick={() => setOverlay('new-tab')}
                      >
                        <Icon name="plus" small />
                        New tab
                      </button>
                    </div>
                  )}
                </main>
                {layout.gitOpen && (
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
                      changes={changes}
                      pr={git.pr}
                      onOpenFile={openFile}
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

      {overlay === 'projects' && (
        <Picker
          title="Projects"
          items={projectItems}
          filterable
          onClose={() => setOverlay(null)}
          onPick={(pid) => {
            setOverlay(null)
            setMode('normal')
            daemon.selectWorkspace(pid, workspaces[pid]?.[0]?.id ?? null)
          }}
        />
      )}
      {newWorkspaceIn !== null && (
        <WorkspaceDialog
          projectName={projects.find((p) => p.id === newWorkspaceIn)?.name ?? ''}
          onClose={() => setNewWorkspaceIn(null)}
          onCreate={async (name, base) => daemon.createWorkspace(newWorkspaceIn, name, base)}
        />
      )}
      {overlay === 'new-tab' && (
        <Picker
          title={`New tab in ${ws?.name ?? 'this workspace'}`}
          items={ASSISTANTS}
          filterable={false}
          onClose={() => setOverlay(null)}
          onPick={createTab}
        />
      )}
    </div>
  )
}
