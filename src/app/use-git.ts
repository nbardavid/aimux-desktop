import { invoke } from '@tauri-apps/api/core'
import { useCallback, useEffect, useRef, useState } from 'react'

import { type PullRequest, toPullRequest } from '../git/pr'

export interface BranchState {
  branch: string | null
  upstream: boolean
  remote: boolean
  ahead: number
  behind: number
}

export interface FileChange {
  path: string
  status: string
  untracked: boolean
  /** Some of it is in the index; some of it is only in the working tree. Both can hold. */
  staged: boolean
  unstaged: boolean
  add: number | null
  del: number | null
}

const ACTIVE_MS = 4000
// ponytail: every other workspace is re-read on one slow timer; watch the files if it gets costly.
const OTHERS_MS = 30_000
const PR_MS = 60_000
// While a check runs, its result is what the user waits for.
const PR_PENDING_MS = 15_000
const FOCUS_GAP_MS = 10_000

async function status(path: string): Promise<FileChange[] | null> {
  return invoke<FileChange[]>('git_status', { path }).catch(() => null)
}

/**
 * Git status of every workspace path (the active one kept fresh), and the active branch's PR.
 * `settled` changes when a chat in the active workspace ends a turn: Claude may have pushed or
 * opened the PR, so it is read again then.
 */
export function useGit(activePath: string | undefined, paths: string[], settled = 0) {
  const [changes, setChanges] = useState<Record<string, FileChange[] | null>>({})
  const [pr, setPr] = useState<PullRequest | null>(null)
  const [branch, setBranch] = useState<BranchState | null>(null)
  // Bumped after a write (commit, push, merge…) to read everything again at once.
  const [tick, setTick] = useState(0)
  const refresh = useCallback(() => setTick((t) => t + 1), [])
  const key = paths.join('\n')

  useEffect(() => {
    const all = key === '' ? [] : key.split('\n')
    const read = async (targets: string[]) => {
      if (!document.hasFocus() && targets.length === 1) return
      const results = await Promise.all(targets.map(async (p) => [p, await status(p)] as const))
      setChanges((state) => ({ ...state, ...Object.fromEntries(results) }))
      if (activePath !== undefined && targets.includes(activePath)) {
        setBranch(await invoke<BranchState>('git_branch', { path: activePath }).catch(() => null))
      }
    }
    void read(all)
    const active =
      activePath === undefined ? undefined : setInterval(() => void read([activePath]), ACTIVE_MS)
    const others = setInterval(() => void read(all), OTHERS_MS)
    return () => {
      clearInterval(active)
      clearInterval(others)
    }
  }, [activePath, key, tick])

  // The last PR seen per workspace: switching back shows it at once, then gh confirms it.
  const prs = useRef(new Map<string, PullRequest | null>())
  useEffect(() => {
    setPr(activePath === undefined ? null : (prs.current.get(activePath) ?? null))
  }, [activePath])

  useEffect(() => {
    if (activePath === undefined) return
    let live = true
    let timer: ReturnType<typeof setTimeout> | undefined
    let last = 0
    const read = async () => {
      clearTimeout(timer)
      last = Date.now()
      const raw = await invoke<string | null>('pr_view', { path: activePath }).catch(() => null)
      if (!live) return
      const next = raw === null ? null : toPullRequest(raw)
      prs.current.set(activePath, next)
      setPr(next)
      const pending = next?.checks.some((c) => c.state === 'pending') === true
      timer = setTimeout(() => void read(), pending ? PR_PENDING_MS : PR_MS)
    }
    void read()
    // Back to the window: what happened on GitHub meanwhile (not again within 10s: ⌘Tab spam).
    const onFocus = () => {
      if (Date.now() - last > FOCUS_GAP_MS) void read()
    }
    window.addEventListener('focus', onFocus)
    return () => {
      live = false
      clearTimeout(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [activePath, tick, settled])

  return { branch, changes, pr, refresh }
}
