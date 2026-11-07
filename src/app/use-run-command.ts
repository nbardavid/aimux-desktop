import { invoke } from '@tauri-apps/api/core'
import { useCallback, useEffect, useState } from 'react'

/** The project's run command: '' when none is set, null while it loads. */
export function useRunCommand(projectId: string | null) {
  const [command, setCommand] = useState<string | null>(null)
  useEffect(() => {
    setCommand(null)
    if (projectId === null) return
    let live = true
    void invoke<string>('run_command', { projectId })
      .catch(() => '')
      .then((c) => live && setCommand(c))
    return () => {
      live = false
    }
  }, [projectId])
  const save = useCallback(
    async (next: string) => {
      if (projectId === null) return
      await invoke('set_run_command', { command: next, projectId })
      setCommand(next.trim())
    },
    [projectId]
  )
  return { command, save }
}
