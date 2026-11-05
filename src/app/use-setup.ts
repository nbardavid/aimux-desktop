import { invoke } from '@tauri-apps/api/core'
import { useCallback, useEffect, useState } from 'react'

export interface SetupStatus {
  exists: boolean
  path: string
}

const POLL_MS = 3000

/** Whether the project has a setup script, re-read while it may be edited elsewhere. */
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
