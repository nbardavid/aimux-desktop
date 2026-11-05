import { invoke } from '@tauri-apps/api/core'
import { useCallback, useEffect, useState } from 'react'

export interface SetupStatus {
  exists: boolean
  path: string
  runs: Record<string, { exitCode: number | null; ranAt: string | null }>
}

const POLL_MS = 3000

/** The project's setup script, as the TUI's setup widget watches it. */
export function useSetup(projectId: string | null) {
  const [status, setStatus] = useState<SetupStatus | null>(null)

  const read = useCallback(async () => {
    if (projectId === null) return
    const next = await invoke<SetupStatus>('setup_status', { projectId }).catch(() => null)
    setStatus(next)
  }, [projectId])

  useEffect(() => {
    setStatus(null)
    void read()
    const timer = setInterval(() => void read(), POLL_MS)
    return () => clearInterval(timer)
  }, [read])

  return { refresh: read, status }
}
