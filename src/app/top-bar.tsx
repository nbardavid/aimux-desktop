import type { ReactNode } from 'react'

import { GitCompareArrowsIcon, PanelLeftIcon, PanelRightIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Props {
  /** The page on screen (Settings, a diff), set in bold. */
  title: string | undefined
  /** The workspace on screen: said beside the sidebar's toggle while the sidebar is hidden. */
  place?: string
  /** The tabs, between the title and the switches. */
  children?: ReactNode
  sideOpen: boolean
  /** Shown only beside the terminal, where the git panel can sit. */
  gitOpen: boolean | null
  /** Whether there is a workspace whose diff to review. */
  canDiff: boolean
  /** A clean tree: Diff has nothing to show, and says so. */
  noChanges: boolean
  gitMode: boolean
  onShowSide: () => void
  onToggleGit: () => void
  onGitMode: () => void
  /** Shown first among the switches: the update pill. */
  tools?: ReactNode
}

/** A borderless switch of the top bar (Diff, the update pill); `on` while what it shows is. */
export const barButtonClass = (on: boolean) =>
  cn(
    'text-muted-foreground h-7 gap-1.5 px-2 text-sm disabled:opacity-100',
    on && 'bg-active hover:bg-active text-foreground'
  )

/** The window's top row: where you are, its tabs, and the switches for what sits around them. */
export function TopBar(props: Props) {
  return (
    <header
      className="border-border bg-chrome flex h-bar flex-none items-center gap-1.5 border-b pr-2 pl-4"
      data-tauri-drag-region
    >
      {/* With the sidebar hidden: room for the traffic lights, its toggle, the workspace. It
          opens and shuts with the sidebar (200ms, its width and a fade), so the tabs move
          once, one way. The header's gap after it is its own, to shut with it. */}
      <div
        className={cn(
          '-mr-1.5 grid flex-none transition-[grid-template-columns,opacity] duration-200 ease-in-out motion-reduce:transition-none',
          props.sideOpen ? 'grid-cols-[0fr] opacity-0' : 'grid-cols-[1fr] opacity-100'
        )}
        inert={props.sideOpen}
        data-tauri-drag-region
      >
        <div className="min-w-0 overflow-hidden" data-tauri-drag-region>
          <div className="flex items-center gap-1.5 pr-1.5 pl-16" data-tauri-drag-region>
            <Button
              variant="ghost"
              size="icon"
              className="flex-none"
              aria-label="Show the sidebar (⌘B)"
              data-tip="Show sidebar · ⌘B"
              onClick={props.onShowSide}
            >
              <PanelLeftIcon className="size-4" />
            </Button>
            {props.place !== undefined && (
              <span
                className="text-foreground mr-1.5 max-w-[220px] flex-none truncate text-base font-semibold whitespace-nowrap"
                data-tauri-drag-region
              >
                {props.place}
              </span>
            )}
          </div>
        </div>
      </div>
      {props.title !== undefined && (
        <span
          className="text-foreground mr-1.5 max-w-[220px] flex-none truncate text-base font-semibold"
          data-tauri-drag-region
        >
          {props.title}
        </span>
      )}
      <div className="flex min-w-0 flex-1 self-stretch">{props.children}</div>
      <span className="ml-2 flex flex-none items-center gap-1.5">
        {props.tools}
        {props.canDiff && (
          // A disabled button gets no hover of its own: the tip says why on its wrapper.
          <span className="flex" data-tip={props.noChanges ? 'No changes' : 'Review the diff · ⌘G'}>
            <Button
              variant="ghost"
              className={cn(barButtonClass(props.gitMode), 'disabled:opacity-45')}
              aria-pressed={props.gitMode}
              disabled={props.noChanges}
              onClick={props.onGitMode}
            >
              <GitCompareArrowsIcon className="size-4" />
              Diff
            </Button>
          </span>
        )}
        {props.gitOpen !== null && (
          <Button
            variant="ghost"
            size="icon"
            className={cn(props.gitOpen && 'text-foreground')}
            aria-label="Git panel (⌥⌘B)"
            aria-pressed={props.gitOpen}
            data-tip="Git panel · ⌥⌘B"
            data-tip-align="end"
            onClick={props.onToggleGit}
          >
            <PanelRightIcon className="size-4" />
          </Button>
        )}
      </span>
    </header>
  )
}
