import { invoke } from '@tauri-apps/api/core'
import { useEffect, useState } from 'react'

import { claudeSnapshot, type QuotaCache, type RawClaudeUsage } from '../model/quota'

const READ_MS = 30_000
/** Claude's endpoint punishes callers faster than this; the TUI polls at the same floor. */
const FETCH_FLOOR_MS = 180_000
/** A cache this old means no TUI is polling: the GUI takes over. */
const TAKE_OVER_MS = FETCH_FLOOR_MS + 60_000

/** Quotas from the cache the TUI shares; fetched here only when nothing else keeps it fresh. */
export function useQuotas() {
  const [cache, setCache] = useState<QuotaCache>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    let lastFetch = 0
    const tick = async () => {
      const read = ((await invoke<QuotaCache | null>('read_quota_cache').catch(() => null)) ??
        {}) as QuotaCache
      const now = Date.now()
      const age = now - (read.claude?.fetchedAt ?? 0)
      if (age > TAKE_OVER_MS && now - lastFetch > FETCH_FLOOR_MS) {
        lastFetch = now
        try {
          const raw = await invoke<RawClaudeUsage>('fetch_claude_usage')
          read.claude = { fetchedAt: now, snapshot: claudeSnapshot(raw, now) }
          await invoke('write_quota_cache', { cache: read })
          if (live) setError(null)
        } catch (error_) {
          if (live) setError(String(error_))
        }
      }
      if (live) setCache(read)
    }
    void tick()
    const timer = setInterval(() => void tick(), READ_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [])

  return { cache, error }
}
