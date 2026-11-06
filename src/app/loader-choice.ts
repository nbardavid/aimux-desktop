import { invoke } from '@tauri-apps/api/core'
import { useSyncExternalStore } from 'react'

import { DEFAULT_LOADERS, fitsSetting, LOADER_SETTINGS, type LoaderChoice } from './loaders'

let chosen = DEFAULT_LOADERS
let loaded = false
const listeners = new Set<() => void>()

/** The choice from the stored settings: a missing or unknown name is the default. */
export function loadersFrom(settings: Record<string, unknown>): LoaderChoice {
  const pick = (key: keyof LoaderChoice) => {
    const v = settings[LOADER_SETTINGS[key]]
    return fitsSetting(key, v) ? v : DEFAULT_LOADERS[key]
  }
  return { status: pick('status'), thinking: pick('thinking'), working: pick('working') }
}

function set(next: LoaderChoice) {
  chosen = next
  for (const l of listeners) l()
}

/** A loader setting written (or reset, `null`) in Settings: open chats follow at once. */
export function noteLoaderSetting(id: string, value: unknown) {
  const key = (Object.keys(LOADER_SETTINGS) as (keyof LoaderChoice)[]).find(
    (k) => LOADER_SETTINGS[k] === id
  )
  if (key) set({ ...chosen, [key]: fitsSetting(key, value) ? value : DEFAULT_LOADERS[key] })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!loaded) {
    loaded = true
    invoke<{ settings: Record<string, unknown> }>('read_settings')
      .then((read) => set(loadersFrom(read.settings)))
      .catch(() => {
        // Unreadable settings: the defaults play.
      })
  }
  return () => listeners.delete(listener)
}

/** The loaders the chat and the statuses play now; read from Settings once, then kept in step with it. */
export const useLoaderChoice = () => useSyncExternalStore(subscribe, () => chosen)
