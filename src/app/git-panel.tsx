import { openUrl } from '@tauri-apps/plugin-opener'
import { type ReactNode, useState } from 'react'

import type { PullRequest } from '../git/pr'
import type { FileChange } from './use-git'

import { FileList } from './file-list'
import { Icon } from './icons'

interface Props {
  width: number
  changes: FileChange[] | null | undefined
  pr: PullRequest | null
  onOpenFile: (file: FileChange) => void
  setup: ReactNode
}

const PR_DOT = {
  Closed: 'st-failing',
  Draft: 'st-idle',
  Merged: 'st-done',
  Open: 'st-done',
} as const
const CHECK_DOT = { failing: 'st-failing', passing: 'st-done', pending: 'st-waiting' } as const

export function GitPanel({ changes, onOpenFile, pr, setup, width }: Props) {
  const [view, setView] = useState<'changes' | 'pr'>('changes')
  const views = [
    { count: changes?.length ?? 0, id: 'changes', label: 'Changes' },
    { count: null, id: 'pr', label: pr ? `PR #${pr.number}` : 'Pull request' },
  ] as const
  return (
    <aside className="git" aria-label="Git" style={{ width }}>
      <div className="panel-tabs" role="tablist" aria-label="Git view" data-tauri-drag-region>
        {views.map((v) => (
          <button
            type="button"
            key={v.id}
            role="tab"
            aria-selected={view === v.id}
            className={view === v.id ? 'panel-tab is-active' : 'panel-tab'}
            onClick={() => setView(v.id)}
          >
            {v.label}
            {v.count !== null && v.count > 0 && <span className="count">{v.count}</span>}
          </button>
        ))}
      </div>
      <div className="git-scroll">
        {view === 'changes' &&
          (changes ? (
            <FileList changes={changes} onOpen={onOpenFile} />
          ) : (
            <div className="quiet">{changes === null ? 'Not a git repository' : 'Reading…'}</div>
          ))}
        {view === 'pr' &&
          (pr ? (
            <div className="gh">
              <div className="gh-top">
                <span className="status">
                  <span className={`st ${PR_DOT[pr.state]}`} />
                  {pr.state}
                </span>
                <button type="button" className="link-btn" onClick={() => void openUrl(pr.url)}>
                  GitHub
                  <Icon name="external" small />
                </button>
              </div>
              <div className="gh-title">{pr.title}</div>
              <div className="gh-meta">
                <span className="add">+{pr.additions}</span>{' '}
                <span className="del">−{pr.deletions}</span> · {pr.changedFiles} files
              </div>
              {pr.checks.length > 0 && (
                <div className="checks">
                  {pr.checks.map((check) => (
                    <div className="check-row" key={check.name}>
                      <span className={`st ${CHECK_DOT[check.state]}`} />
                      <span className="grow">{check.name}</span>
                      <span className="faint">{check.state}</span>
                    </div>
                  ))}
                </div>
              )}
              {pr.body !== '' && <div className="gh-body">{pr.body}</div>}
            </div>
          ) : (
            <div className="quiet">No pull request for this branch</div>
          ))}
      </div>
      {setup}
    </aside>
  )
}
