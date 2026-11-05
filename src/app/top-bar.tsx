import type { ReactNode } from 'react'

import { GitBranchIcon, PanelLeftIcon, PanelRightIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Props {
  /** The workspace (or the page) on screen, set in bold before its tabs. */
  title: string | undefined
  /** The tabs, between the title and the switches. */
  children?: ReactNode
  sideOpen: boolean
  /** Shown only beside the terminal, where the git panel can sit. */
  gitOpen: boolean | null
  /** Whether there is a workspace whose diff to review. */
  canDiff: boolean
  gitMode: boolean
  onShowSide: () => void
  onToggleGit: () => void
  onGitMode: () => void
  /** Shown first among the switches: the update pill. */
  tools?: ReactNode
}

/** A bordered switch of the top bar (Diff, the update pill); `on` while what it shows is. */
export const barButtonClass = (on: boolean) =>
  cn(
    'border-border text-muted-foreground h-[26px] gap-1.5 border px-[9px] text-[12.5px] disabled:opacity-100',
    on && 'border-line-strong bg-active hover:bg-active text-foreground'
  )

/** The window's top row: where you are, its tabs, and the switches for what sits around them. */
export function TopBar(props: Props) {
  return (
    <header
      className={cn(
        'border-border flex h-bar flex-none items-center gap-1.5 border-b pr-2 pl-4',
        !props.sideOpen && 'pl-20'
      )}
      data-tauri-drag-region
    >
      {!props.sideOpen && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Show the sidebar (⌘B)"
          data-tip="Show sidebar · ⌘B"
          onClick={props.onShowSide}
        >
          <PanelLeftIcon className="size-4" />
        </Button>
      )}
      {props.title !== undefined && (
        <span
          className="mr-1.5 max-w-[220px] flex-none truncate text-[13.5px] font-semibold"
          data-tauri-drag-region
        >
          {props.title}
        </span>
      )}
      <div className="flex min-w-0 flex-1 self-stretch">{props.children}</div>
      <span className="ml-2 flex flex-none items-center gap-1.5">
        {props.tools}
        {props.canDiff && (
          <Button
            variant="ghost"
            className={barButtonClass(props.gitMode)}
            aria-pressed={props.gitMode}
            data-tip="Review the diff · ⌘G"
            onClick={props.onGitMode}
          >
            <GitBranchIcon className="size-3.5" />
            Diff
          </Button>
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
