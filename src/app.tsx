import { useEffect, useMemo, useState } from 'react'

import { GitMode } from './app/git-mode'
import { GitPanel } from './app/git-panel'
import { Icon } from './app/icons'
import { Picker, type PickerItem } from './app/picker'
import { type DiffStat, Sidebar } from './app/sidebar'
import { StatusBar } from './app/status-bar'
import { TabBar } from './app/tab-bar'
import { TerminalView } from './app/terminal-view'
import { useDaemon } from './app/use-daemon'
import { type FileChange, useGit } from './app/use-git'
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
  const [mode, setMode] = useState<'normal' | 'git'>('normal')
  const [overlay, setOverlay] = useState<'projects' | 'new-tab' | null>(null)
  const [gitFile, setGitFile] = useState<FileChange>()
  const [notice, setNotice] = useState<string | null>(null)

  const project = projects.find((p) => p.id === projectId)
  const list = (projectId === null ? undefined : workspaces[projectId]) ?? []
  const ws = list.find((w) => w.id === daemon.workspaceId) ?? list[0]
  const tabs = ws ? tabsOf(session.tabs, ws, list) : session.tabs
  const tab = tabs.find((t) => t.id === daemon.activeTabId) ?? tabs[0]

  const paths = useMemo(
    () => [...new Set(Object.values(workspaces).flatMap((l) => l.flatMap((w) => w.path ?? [])))],
    [workspaces]
  )
  const git = useGit(ws?.path, paths)
  const changes = ws?.path === undefined ? undefined : git.changes[ws.path]
  const diffs = useMemo(
    () => Object.fromEntries(Object.entries(git.changes).map(([path, c]) => [path, sum(c)])),
    [git.changes]
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey) return
      const index = Number(e.key)
      if (e.key === 'p') setOverlay('projects')
      else if (e.key === 't') setOverlay('new-tab')
      else if (e.key === 'g') setMode((m) => (m === 'git' ? 'normal' : 'git'))
      else if (tabs[index - 1] !== undefined && index >= 1)
        daemon.selectTab(tabs[index - 1]?.id ?? null)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [daemon, tabs])

  useEffect(() => {
    if (notice === null) return
    const timer = setTimeout(() => setNotice(null), 6000)
    return () => clearTimeout(timer)
  }, [notice])

  if (status.kind === 'loading' || status.kind === 'no-projects' || status.kind === 'error') {
    const message = {
      'error': status.kind === 'error' ? status.message : '',
      'loading': 'Connecting to aimux…',
      'no-projects': 'No projects yet. Run aimux inside a repo.',
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

  const openFile = (file: FileChange) => {
    setGitFile(file)
    setMode('git')
  }

  return (
    <div className="app">
      <div className="cols">
        <Sidebar
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
        />
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
                    className="btn btn-outline"
                    onClick={() => setOverlay('new-tab')}
                  >
                    <Icon name="plus" small />
                    New tab
                  </button>
                </div>
              )}
            </main>
            <GitPanel changes={changes} pr={git.pr} onOpenFile={openFile} />
          </>
        )}
        {mode === 'git' && ws?.path !== undefined && (
          <GitMode
            path={ws.path}
            branch={ws.branch}
            changes={changes ?? []}
            file={changes?.find((f) => f.path === gitFile?.path)}
            onSelect={setGitFile}
            onExit={() => setMode('normal')}
          />
        )}
        {mode === 'git' && ws?.path === undefined && (
          <div className="quiet fill">Not a git repository</div>
        )}
      </div>

      <StatusBar
        mode={mode}
        connected={status.kind === 'ready'}
        projectName={project?.name ?? ''}
        workspaceName={ws?.name ?? ''}
        path={ws?.path}
        onProjects={() => setOverlay('projects')}
        onToggleGit={() => setMode((m) => (m === 'git' ? 'normal' : 'git'))}
      />

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
            <span className="toast-title">Could not create the tab</span>
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
