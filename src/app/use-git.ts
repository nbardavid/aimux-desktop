import { invoke } from '@tauri-apps/api/core'
import { useEffect, useState } from 'react'

import { type PullRequest, toPullRequest } from '../git/pr'

export interface FileChange {
  path: string
  status: string
  untracked: boolean
  add: number | null
  del: number | null
}

const ACTIVE_MS = 4000
// ponytail: every other workspace is re-read on one slow timer; watch the files if it gets costly.
const OTHERS_MS = 30_000
const PR_MS = 60_000

async function status(path: string): Promise<FileChange[] | null> {
  return invoke<FileChange[]>('git_status', { path }).catch(() => null)
}

/** Git status of every workspace path (the active one kept fresh), and the active branch's PR. */
export function useGit(activePath: string | undefined, paths: string[]) {
  const [changes, setChanges] = useState<Record<string, FileChange[] | null>>({})
  const [pr, setPr] = useState<PullRequest | null>(null)
  const key = paths.join('\n')

  useEffect(() => {
    const all = key === '' ? [] : key.split('\n')
    const read = async (targets: string[]) => {
      if (!document.hasFocus() && targets.length === 1) return
      const results = await Promise.all(targets.map(async (p) => [p, await status(p)] as const))
      setChanges((state) => ({ ...state, ...Object.fromEntries(results) }))
    }
    void read(all)
    const active =
      activePath === undefined ? undefined : setInterval(() => void read([activePath]), ACTIVE_MS)
    const others = setInterval(() => void read(all), OTHERS_MS)
    return () => {
      clearInterval(active)
      clearInterval(others)
    }
  }, [activePath, key])

  useEffect(() => {
    setPr(null)
    if (activePath === undefined) return
    let live = true
    const read = async () => {
      const raw = await invoke<string | null>('pr_view', { path: activePath }).catch(() => null)
      if (live) setPr(raw === null ? null : toPullRequest(raw))
    }
    void read()
    const timer = setInterval(() => void read(), PR_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [activePath])

  return { changes, pr }
}
