import { invoke } from '@tauri-apps/api/core'
import { useCallback, useEffect, useRef, useState } from 'react'

// What the background host runs: chats and terminals that outlive the window.

export interface HostChat {
  id: string
  alive: boolean
  working: boolean
  waiting: boolean
  /** A turn ended, or a permission was asked, while no window was there to see it. */
  unread: boolean
  /** How many transcript lines Claude was resumed from: the replay covers the rest. */
  historyLen: number
}

export interface HostTerm {
  id: string
  workspaceId: string
  cwd: string
  title: string
  command: string | null
  /** Opaque to the host: `setup` for a setup script. */
  tag: string | null
  ended: boolean
  code: number | null
}

export interface HostList {
  chats: HostChat[]
  terms: HostTerm[]
}

interface HostStatus {
  protocolOk: boolean
  list: HostList
}

export type HostState =
  | { kind: 'loading' }
  | { kind: 'ready'; list: HostList }
  | { kind: 'blocked'; lose: { chats: number; terms: number } }

export const HOST_BLOCKED = 'The background process needs a restart.'

/** What restarting the host would cut: chats in a turn or asking, terminals still running. */
export function wouldLose(list: HostList): { chats: number; terms: number } {
  return {
    chats: list.chats.filter((c) => c.alive && (c.working || c.waiting)).length,
    terms: list.terms.filter((t) => !t.ended).length,
  }
}

/** A host from another protocol is restarted silently, unless that would cut work. */
export function hostDecision(status: HostStatus): 'attach' | 'restart' | 'blocked' {
  if (status.protocolOk) return 'attach'
  const lose = wouldLose(status.list)
  return lose.chats === 0 && lose.terms === 0 ? 'restart' : 'blocked'
}

/** The host at launch: attached, restarted when nothing is lost, or held for the user to say. */
export function useHost() {
  const [state, setState] = useState<HostState>({ kind: 'loading' })
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const connect = async (): Promise<HostState> => {
      let status = await invoke<HostStatus>('host_status')
      const decision = hostDecision(status)
      if (decision === 'blocked') return { kind: 'blocked', lose: wouldLose(status.list) }
      if (decision === 'restart') {
        await invoke('host_restart')
        status = await invoke<HostStatus>('host_status')
      }
      return { kind: 'ready', list: status.list }
    }
    // No host at all: the app still opens, and each chat or terminal says why it cannot start.
    void connect()
      .catch((): HostState => ({ kind: 'ready', list: { chats: [], terms: [] } }))
      .then(setState)
  }, [])

  /** Everything is read again from the new host, as at launch. */
  const restart = useCallback(async () => {
    await invoke('host_restart')
    location.reload()
  }, [])

  return { restart, state }
}
