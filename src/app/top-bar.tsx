import type { ReactNode } from 'react'

import { Icon } from './icons'

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
}

/** The window's top row: where you are, its tabs, and the switches for what sits around them. */
export function TopBar(props: Props) {
  return (
    <header className={props.sideOpen ? 'topbar' : 'topbar no-side'} data-tauri-drag-region>
      {!props.sideOpen && (
        <button
          type="button"
          className="icon-btn"
          aria-label="Show the sidebar (⌘B)"
          data-tip="Show sidebar · ⌘B"
          onClick={props.onShowSide}
        >
          <Icon name="panelLeft" />
        </button>
      )}
      {props.title !== undefined && (
        <span className="bar-title" data-tauri-drag-region>
          {props.title}
        </span>
      )}
      <div className="bar-tabs">{props.children}</div>
      <span className="bar-tools">
        {props.canDiff && (
          <button
            type="button"
            className={props.gitMode ? 'bar-btn is-on' : 'bar-btn'}
            aria-pressed={props.gitMode}
            data-tip="Review the diff · ⌘G"
            onClick={props.onGitMode}
          >
            <Icon name="branch" small />
            Diff
          </button>
        )}
        {props.gitOpen !== null && (
          <button
            type="button"
            className={props.gitOpen ? 'icon-btn is-on' : 'icon-btn'}
            aria-label="Git panel (⌥⌘B)"
            aria-pressed={props.gitOpen}
            data-tip="Git panel · ⌥⌘B"
            data-tip-align="end"
            onClick={props.onToggleGit}
          >
            <Icon name="panelRight" />
          </button>
        )}
      </span>
    </header>
  )
}
