import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'

import { barButtonClass } from './top-bar'

/** At most this often when the window comes back to the front. */
const ON_FOCUS = 10 * 60 * 1000
/** And this often while it stays there. */
const EVERY = 60 * 60 * 1000

/** `bun run dev` inside Tauri: a debug build, which never updates itself. */
export const devBuild = import.meta.env.DEV && '__TAURI_INTERNALS__' in window

export interface Update {
  /** The newer version on offer, or null. */
  version: string | null
  /** A check is out (only those asked for show it). */
  checking: boolean
  /** When the last check answered; null until one has. */
  checkedAt: number | null
  installing: boolean
  /** Why the last check asked for failed. */
  checkError: string | null
  /** Why the last install failed. */
  error: string | null
  check: () => void
  install: () => void
}

/** Whether coming back to the window should check again. */
export function dueOnFocus(checkedAt: number | null, now: number): boolean {
  return checkedAt === null || now - checkedAt >= ON_FOCUS
}

/**
 * A newer release: checked at launch, when the window comes back to the front (at most
 * every ten minutes), every hour, and from Settings › About. A dev build never finds one.
 */
export function useUpdate(): Update {
  const [version, setVersion] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [checkedAt, setCheckedAt] = useState<number | null>(null)
  const [installing, setInstalling] = useState(false)
  const [checkError, setCheckError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const lastCheck = useRef<number | null>(null)

  const run = useCallback((asked: boolean) => {
    lastCheck.current = Date.now()
    if (asked) {
      setChecking(true)
      setCheckError(null)
    }
    void invoke<string | null>('update_check')
      .then(
        (found) => {
          setVersion(found)
          setCheckedAt(Date.now())
        },
        (error_: unknown) => {
          // Offline or GitHub down: quiet unless asked; the next check tries again.
          if (asked) setCheckError(String(error_).replace(/^Error: /, ''))
        }
      )
      .finally(() => asked && setChecking(false))
  }, [])

  useEffect(() => {
    run(false)
    const timer = setInterval(() => run(false), EVERY)
    const unlisten = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (focused && dueOnFocus(lastCheck.current, Date.now())) run(false)
    })
    return () => {
      clearInterval(timer)
      void unlisten.then((f) => f())
    }
  }, [run])

  const install = () => {
    setInstalling(true)
    setError(null)
    // On success the window relaunches and this never resolves.
    void invoke('update_install').catch((error_: unknown) => {
      setInstalling(false)
      setError(String(error_))
    })
  }
  return {
    check: () => run(true),
    checkedAt,
    checkError,
    checking,
    error,
    install,
    installing,
    version,
  }
}

/** The top bar's pill: there only while an update waits. */
export function UpdateButton({ update }: { update: Update }) {
  if (update.version === null) return null
  let label = `Update to ${update.version}`
  if (update.installing) label = 'Updating…'
  else if (update.error !== null) label = 'Update failed · Retry'
  return (
    <Button
      variant="ghost"
      className={barButtonClass(true)}
      disabled={update.installing}
      data-tip={update.error ?? 'Restarts the window; chats and terminals keep running'}
      data-tip-align="end"
      onClick={update.install}
    >
      {label}
    </Button>
  )
}
