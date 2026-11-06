import { invoke } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import { ArrowLeftIcon, ArrowUpRightIcon, ChevronDownIcon, RotateCwIcon, XIcon } from 'lucide-react'
import { type ReactNode, type Ref, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import type { Artifact } from '../model/catalog'

import { ArtifactList } from './artifact-list'
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
  chatOf,
  cover,
  list,
  onClose,
  onPick,
  placeholder,
}: {
  artifact: Artifact
  /** Every artifact of the workspace, newest first: the list the title opens. */
  list: Artifact[]
  /** The chat an artifact came from ('' when unknown). */
  chatOf: (a: Artifact) => string
  onPick: (url: string) => void
  onClose: (url: string) => void
  cover: ReactNode
  placeholder: Ref<HTMLDivElement>
}) {
  const id = browserId(artifact.url)
  // Choosing another artifact: the list takes the page's place (the page hides as its
  // placeholder goes), then the chosen page comes back.
  const [picking, setPicking] = useState(false)
  useEffect(() => setPicking(false), [artifact.url])
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
          <button
            type="button"
            aria-expanded={picking}
            aria-label={`${artifact.title || 'Artifact'}: choose another artifact`}
            className="hover:bg-foreground/6 aria-expanded:bg-foreground/6 flex h-7 max-w-full min-w-0 items-center gap-1.5 rounded-lg pr-2 pl-2.5 text-sm transition-colors duration-120"
            onClick={() => setPicking((p) => !p)}
          >
            <span className="min-w-0 truncate font-medium">{artifact.title || 'Artifact'}</span>
            <ChevronDownIcon
              className={cn(
                'text-label size-3.5 flex-none transition-transform duration-150 ease-[cubic-bezier(0.2,0,0,1)]',
                picking && 'rotate-180'
              )}
            />
          </button>
        </div>
        {tool('Open in browser', <ArrowUpRightIcon className="size-4" />, () => {
          void openUrl(artifact.url).catch(() => {})
        })}
        {tool('Close this artifact', <XIcon className="size-4" />, () => onClose(artifact.url))}
      </div>
      {picking ? (
        <ArtifactList
          list={list}
          current={artifact.url}
          chatOf={chatOf}
          onCancel={() => setPicking(false)}
          onPick={(url) => {
            setPicking(false)
            onPick(url)
          }}
        />
      ) : (
        <div ref={placeholder} className="bg-chrome relative min-h-0 flex-1">
          {cover}
        </div>
      )}
    </div>
  )
}

/**
 * Under the page, seen only while it steps aside (a menu, ⌘P or a dialog over it, the panel
 * moving): its title and address, quiet, so the pause reads as one.
 */
export function PausedPage({ artifact }: { artifact: Artifact }) {
  return (
    <div className="animate-in fade-in flex h-full flex-col items-center justify-center gap-1 px-6 text-center duration-160">
      <span className="text-muted-foreground max-w-full truncate text-sm font-medium">
        {artifact.title || 'Artifact'}
      </span>
      <span className="text-label max-w-full truncate text-xs">
        {artifact.url.replace(/^https:\/\//, '')}
      </span>
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
