import { invoke } from '@tauri-apps/api/core'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'

import { barButtonClass } from './top-bar'

const EVERY = 6 * 60 * 60 * 1000

export interface Update {
  version: string | null
  installing: boolean
  error: string | null
  install: () => void
}

/** A newer release, checked at launch and every six hours; a dev build never finds one. */
export function useUpdate(): Update {
  const [version, setVersion] = useState<string | null>(null)
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    // Offline or GitHub down: try again next time, quietly.
    const check = () => void invoke<string | null>('update_check').then(setVersion, () => {})
    check()
    const timer = setInterval(check, EVERY)
    return () => clearInterval(timer)
  }, [])
  const install = () => {
    setInstalling(true)
    setError(null)
    // On success the window relaunches and this never resolves.
    void invoke('update_install').catch((error_: unknown) => {
      setInstalling(false)
      setError(String(error_))
    })
  }
  return { error, install, installing, version }
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
