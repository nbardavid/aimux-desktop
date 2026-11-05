import { Icon } from './icons'
import { ProjectAvatar } from './sidebar'

interface Props {
  /** The project, then where in it: the workspace's branch, or a page's name. */
  project: string | undefined
  place: string | undefined
  sideOpen: boolean
  gitOpen: boolean
  gitMode: boolean
  onShowSide: () => void
  onToggleGit: () => void
  onGitMode: () => void
}

/** The path to what is on screen, and the switches for what sits around it. */
export function TopBar(props: Props) {
  return (
    <header className={props.sideOpen ? 'topbar' : 'topbar no-side'} data-tauri-drag-region>
      {!props.sideOpen && (
        <button
          type="button"
          className="icon-btn"
          aria-label="Show the sidebar (⌘B)"
          title="Show the sidebar (⌘B)"
          onClick={props.onShowSide}
        >
          <Icon name="panelLeft" />
        </button>
      )}
      <span className="crumbs" data-tauri-drag-region>
        {props.project !== undefined && (
          <>
            <ProjectAvatar name={props.project} />
            <span className="crumb">{props.project}</span>
          </>
        )}
        {props.place !== undefined && (
          <>
            {props.project !== undefined && <Icon name="chevron" small />}
            <span className="crumb">{props.place}</span>
          </>
        )}
      </span>
      <button
        type="button"
        className={props.gitMode ? 'bar-btn is-on' : 'bar-btn'}
        aria-pressed={props.gitMode}
        title="Review the diff (⌘G)"
        onClick={props.onGitMode}
      >
        <Icon name="branch" small />
        Diff
      </button>
      <button
        type="button"
        className={props.gitOpen ? 'icon-btn is-on' : 'icon-btn'}
        aria-label="Git panel (⌥⌘B)"
        aria-pressed={props.gitOpen}
        title="Git panel (⌥⌘B)"
        onClick={props.onToggleGit}
      >
        <Icon name="panelRight" />
      </button>
    </header>
  )
}
