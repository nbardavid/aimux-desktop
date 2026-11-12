import { invoke } from '@tauri-apps/api/core'
import { useCallback } from 'react'

import type { Workspace } from '../model/catalog'
import type { useTerminals } from './use-terminals'

import { HOST_BLOCKED } from './use-host'

/** A project's setup script, run in a workspace's dock. */
export function useSetupRun(
  ready: boolean,
  reload: () => Promise<unknown>,
  terminals: ReturnType<typeof useTerminals>
) {
  /** A setup script's end is kept for the git panel, even when the window missed it. */
  const setupRan = useCallback(
    (workspaceId: string) => (exitCode: number | null) =>
      void invoke('setup_ran', { exitCode, workspaceId }).then(reload),
    [reload]
  )

  /** The script in `w`'s dock; how it ended is kept for the git panel. */
  const runSetup = async (w: Workspace) => {
    if (!ready) throw new Error(HOST_BLOCKED)
    const script = await invoke<string>('ensure_setup_script', { projectId: w.projectId })
    return terminals.create({
      command: `bash '${script.replaceAll("'", "'\\''")}'`,
      cwd: w.path,
      onExit: setupRan(w.id),
      tag: 'setup',
      title: 'Setup',
      workspaceId: w.id,
    })
  }

  return { runSetup, setupRan }
}
