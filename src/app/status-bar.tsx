import { Icon } from './icons'

interface Props {
  mode: 'normal' | 'git'
  connected: boolean
  projectName: string
  workspaceName: string
  path: string | undefined
  onProjects: () => void
  onToggleGit: () => void
}

export function StatusBar(props: Props) {
  const git = props.mode === 'git'
  return (
    <footer className="statusbar">
      <span className={git ? 'mode mode-git' : 'mode'}>{git ? 'Git' : 'Terminal'}</span>
      <button type="button" className="item strong" onClick={props.onProjects}>
        {props.projectName}
      </button>
      <span className="sep">·</span>
      <span className="item">{props.workspaceName}</span>
      {props.path !== undefined && (
        <>
          <span className="sep">·</span>
          <span className="path">{props.path}</span>
        </>
      )}
      <span className="push" />
      <button type="button" className="item" onClick={props.onToggleGit}>
        <Icon name="branch" small />
        {git ? 'Back to tabs' : 'Git mode'}
        <span className="kbd">⌘G</span>
      </button>
      <span className="item">
        <span className={props.connected ? 'st st-done' : 'st st-waiting'} />
        {props.connected ? 'daemon' : 'reconnecting…'}
      </span>
    </footer>
  )
}
