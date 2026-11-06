import type { ReactNode, Ref } from 'react'

import { invoke } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import { ArrowLeftIcon, ArrowUpRightIcon, RotateCwIcon, XIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'

import { type Artifact, isNew } from '../model/catalog'
import { browserId } from './browser-tabs'
import { Combo } from './combo'
import { ageLabel } from './sidebar'
import { Dot } from './status-dot'

/** Outside Tauri (the browser preview) there is no native page: the placeholder says what it would show. */
export const nativePages = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

/**
 * A page of the right panel: its address bar, then the placeholder the native webview is laid
 * over exactly (use-browser.ts keeps it there). `cover` draws inside the placeholder while the
 * page is not on it: loading, or the preview's stand-in.
 */
export function BrowserView({
  artifact,
  chatOf,
  cover,
  list,
  onClose,
  onPick,
  placeholder,
}: {
  artifact: Artifact
  /** Every artifact of the workspace, newest first: the title's menu. */
  list: Artifact[]
  /** The chat an artifact came from ('' when unknown). */
  chatOf: (a: Artifact) => string
  onPick: (url: string) => void
  onClose: (url: string) => void
  cover: ReactNode
  placeholder: Ref<HTMLDivElement>
}) {
  const id = browserId(artifact.url)
  const now = Date.now()
  const options = list.map((a) => ({
    hint: [chatOf(a), ageLabel(a.at, now)].filter((part) => part !== '').join(' · '),
    label: a.title || 'Artifact',
    mark: isNew(a) && a.url !== artifact.url ? <Dot tone="done" label="New" /> : undefined,
    value: a.url,
  }))
  const tool = (label: string, icon: ReactNode, run: () => void) => (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      data-tip={label}
      data-tip-side="top"
      onClick={run}
    >
      {icon}
    </Button>
  )
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="bg-chrome flex h-bar flex-none items-center gap-0.5 border-y px-1.5">
        {tool('Back', <ArrowLeftIcon className="size-4" />, () => {
          void invoke('browser_back', { id }).catch(() => {})
        })}
        {tool('Reload', <RotateCwIcon className="size-3.5" />, () => {
          void invoke('browser_reload', { id }).catch(() => {})
        })}
        <div className="min-w-0 flex-1">
          <Combo
            className="hover:bg-hover flex h-7 max-w-full min-w-0 items-center gap-1 px-2 text-sm"
            button={
              <span className="min-w-0 truncate font-medium">{artifact.title || 'Artifact'}</span>
            }
            options={options}
            selected={artifact.url}
            placeholder="Find an artifact"
            popupClassName="w-80"
            onPick={onPick}
          />
        </div>
        {tool('Open in browser', <ArrowUpRightIcon className="size-4" />, () => {
          void openUrl(artifact.url).catch(() => {})
        })}
        {tool('Close this artifact', <XIcon className="size-4" />, () => onClose(artifact.url))}
      </div>
      <div ref={placeholder} className="bg-chrome relative min-h-0 flex-1">
        {cover}
      </div>
    </div>
  )
}

/** The browser preview's stand-in for a page: its title and address. */
export function PageStandIn({ artifact }: { artifact: Artifact }) {
  return (
    <div className="grid h-full place-items-center p-6">
      <div className="bg-background flex max-w-80 flex-col gap-1 rounded-lg border px-4 py-3">
        <span className="truncate text-sm font-medium">{artifact.title || 'Artifact'}</span>
        <span className="text-faint truncate text-xs">{artifact.url}</span>
        <span className="text-label mt-1 text-xs">The page shows here in the app.</span>
      </div>
    </div>
  )
}
