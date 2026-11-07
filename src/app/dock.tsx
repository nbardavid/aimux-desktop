// The workspace's dock, wired: the project's setup script and run command, and the actions
// that run them in the dock's terminals.
import { invoke } from '@tauri-apps/api/core'

import type { Workspace } from '../model/catalog'
import type { TerminalTab, useTerminals } from './use-terminals'

import { useRunCommand } from './use-run-command'
import { useSetup } from './use-setup'
import { WorkspaceDock } from './workspace-dock'

interface Props {
  ws: Workspace
  projectName: string
  /** The workspace's dock terminals (setup, run, quick ones). */
  terms: TerminalTab[]
  terminals: ReturnType<typeof useTerminals>
  /** Whether the host can start processes; else `onBlocked` says why not. */
  hostReady: boolean
  onBlocked: (title: string) => void
  fail: (title: string) => (error: unknown) => void
  runSetup: (w: Workspace) => Promise<unknown>
  /** Opens a chat asking Claude to write the setup script at `script`. */
  onWriteSetup: (script: string) => void
}

export function Dock({ fail, hostReady, onBlocked, terminals, terms, ws, ...props }: Props) {
  const setup = useSetup(ws.projectId)
  const run = useRunCommand(ws.projectId)

  const setupAction = async (what: 'edit' | 'run' | 'chat') => {
    try {
      if (what === 'edit') await invoke('edit_setup_script', { projectId: ws.projectId })
      else if (what === 'run') await props.runSetup(ws)
      else {
        const script = await invoke<string>('ensure_setup_script', { projectId: ws.projectId })
        props.onWriteSetup(script)
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

  const stop = () => {
    for (const t of terms) if (t.tag === 'run') terminals.close(t.id)
  }

  /** The project's run command here; a run already going is stopped first. */
  const runApp = () => {
    if (!hostReady) return onBlocked("Couldn't run the app")
    if (run.command === null || run.command === '') return
    stop()
    terminals.create({
      command: run.command,
      cwd: ws.path,
      tag: 'run',
      title: 'Run',
      workspaceId: ws.id,
    })
  }

  return (
    <WorkspaceDock
      workspace={ws}
      projectName={props.projectName}
      setup={setup.status}
      runCommand={run.command}
      terms={terms}
      attach={terminals.attach}
      onSetupRun={() => void setupAction('run')}
      onSetupEdit={() => void setupAction('edit')}
      onSetupAgent={() => void setupAction('chat')}
      onSaveRunCommand={(c) => void run.save(c).catch(fail("Couldn't save the run command"))}
      onRun={runApp}
      onStop={stop}
      onNewTerminal={() => {
        if (!hostReady) onBlocked("Couldn't open a terminal")
        else terminals.create({ cwd: ws.path, tag: 'dock', workspaceId: ws.id })
      }}
      onCloseTerminal={terminals.close}
    />
  )
}
