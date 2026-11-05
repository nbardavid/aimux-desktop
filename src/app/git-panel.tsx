import { openUrl } from '@tauri-apps/plugin-opener'
import { type ReactNode, useState } from 'react'

import type { PullRequest } from '../git/pr'
import type { FileChange } from './use-git'

import { FileList } from './file-list'
import { Icon } from './icons'

interface Props {
  setup: ReactNode
  changes: FileChange[] | null | undefined
  pr: PullRequest | null
  onOpenFile: (file: FileChange) => void
}

const PR_DOT = {
  Closed: 'st-failing',
  Draft: 'st-idle',
  Merged: 'st-done',
  Open: 'st-done',
} as const
const CHECK_DOT = { failing: 'st-failing', passing: 'st-done', pending: 'st-waiting' } as const

export function GitPanel({ changes, onOpenFile, pr, setup }: Props) {
  const [view, setView] = useState<'diff' | 'github'>('diff')
  return (
    <aside className="git" aria-label="Git">
      <div className="git-top" data-tauri-drag-region>
        {pr && (
          <div className="pr-line">
            <span className="pr-num">#{pr.number}</span>
            <span className="status">
              <span className={`st ${PR_DOT[pr.state]}`} />
              {pr.state}
            </span>
            <button
              type="button"
              className="icon-btn"
              aria-label="Open on GitHub"
              onClick={() => void openUrl(pr.url)}
            >
              <Icon name="external" small />
            </button>
          </div>
        )}
        <div className="segmented" role="radiogroup" aria-label="Git view">
          {(['diff', 'github'] as const).map((id) => (
            <button
              type="button"
              key={id}
              role="radio"
              aria-checked={view === id}
              className={view === id ? 'seg is-on' : 'seg'}
              onClick={() => setView(id)}
            >
              {id === 'diff' ? 'Diff' : 'GitHub'}
            </button>
          ))}
        </div>
      </div>
      <div className="git-scroll">
        {view === 'diff' &&
          (changes ? (
            <FileList changes={changes} onOpen={onOpenFile} />
          ) : (
            <div className="quiet">{changes === null ? 'Not a git repository' : 'Reading…'}</div>
          ))}
        {view === 'github' &&
          (pr ? (
            <div className="gh">
              <div className="gh-title">{pr.title}</div>
              <div className="gh-meta">
                <span className="add">+{pr.additions}</span>{' '}
                <span className="del">−{pr.deletions}</span> · {pr.changedFiles} files
              </div>
              {pr.body !== '' && <div className="gh-body">{pr.body}</div>}
              {pr.checks.length > 0 && (
                <div>
                  <div className="git-section flush">Checks</div>
                  {pr.checks.map((check) => (
                    <div className="check-row" key={check.name}>
                      <span className="status">
                        <span className={`st ${CHECK_DOT[check.state]}`} />
                        {check.name}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="quiet">No pull request for this branch</div>
          ))}
      </div>
      {setup}
    </aside>
  )
}
