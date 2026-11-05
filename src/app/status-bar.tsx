import type { QuotaCache } from '../model/quota'

import { Icon } from './icons'
import { Quotas } from './quotas'

const MODE_LABEL = { git: 'Git', normal: 'Terminal', settings: 'Settings', stats: 'Stats' } as const

interface Props {
  mode: 'normal' | 'git' | 'stats' | 'settings'
  connected: boolean
  projectName: string
  workspaceName: string
  path: string | undefined
  onProjects: () => void
  onToggleGit: () => void
  quotas: QuotaCache
  quotaError: string | null
}

export function StatusBar(props: Props) {
  const git = props.mode === 'git'
  return (
    <footer className="statusbar">
      <span className={git ? 'mode mode-git' : 'mode'}>{MODE_LABEL[props.mode]}</span>
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
      <Quotas cache={props.quotas} error={props.quotaError} />
      <span className="item">
        <span className={props.connected ? 'st st-done' : 'st st-waiting'} />
        {props.connected ? 'daemon' : 'reconnecting…'}
      </span>
    </footer>
  )
}
