import type { ReactNode, Ref } from 'react'

import { invoke } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import { ArrowLeftIcon, ArrowUpRightIcon, RotateCwIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'

import type { Artifact } from '../model/catalog'

import { browserId } from './browser-tabs'

/** Outside Tauri (the browser preview) there is no native page: the placeholder says what it would show. */
export const nativePages = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

/**
 * A page of the right panel: its address bar, then the placeholder the native webview is laid
 * over exactly (use-browser.ts keeps it there). `cover` draws inside the placeholder while the
 * page is not on it: loading, or the preview's stand-in.
 */
export function BrowserView({
  artifact,
  cover,
  placeholder,
}: {
  artifact: Artifact
  cover: ReactNode
  placeholder: Ref<HTMLDivElement>
}) {
  const id = browserId(artifact.url)
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
        <span className="text-faint min-w-0 flex-1 truncate px-1.5 text-xs" title={artifact.url}>
          {artifact.url.replace(/^https:\/\//, '')}
        </span>
        {tool('Open in browser', <ArrowUpRightIcon className="size-4" />, () => {
          void openUrl(artifact.url).catch(() => {})
        })}
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
