import { useState } from 'react'

import type { Workspace } from '../model/catalog'
import type { SetupStatus } from './use-setup'

import { Icon } from './icons'

interface Props {
  status: SetupStatus | null
  workspace: Workspace
  onEdit: () => void
  onRun: () => void
  onAgent: () => void
}

function lastRun(run: Workspace['setup']) {
  if (!run) return { dot: 'st-idle', text: 'Not run' }
  if (run.exitCode === 0) return { dot: 'st-done', text: 'Ran fine' }
  return { dot: 'st-failing', text: `Exit ${run.exitCode ?? '?'}` }
}

/** The TUI's setup widget: what a fresh worktree lacks, installed by one script per project. */
export function SetupSection({ onAgent, onEdit, onRun, status, workspace }: Props) {
  const [open, setOpen] = useState(false)
  if (status === null) return null
  const run = lastRun(workspace.setup)
  return (
    <div className="setup">
      <button
        type="button"
        className="setup-head"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={open ? 'chev is-open' : 'chev'}>
          <Icon name="chevron" small />
        </span>
        <span className={open ? 'setup-tab is-on' : 'setup-tab'}>Setup</span>
        <span className="grow" />
        {status.exists ? (
          <span className="status">
            <span className={`st ${run.dot}`} />
            {run.text}
          </span>
        ) : (
          <span className="faint">No script</span>
        )}
      </button>
      {open && (
        <div className="setup-body">
          <div className="empty-box">
            <span>
              {status.exists
                ? `Runs in each new workspace of this project. This one: ${workspace.name}.`
                : 'A setup script installs what a fresh worktree lacks: dependencies, .env, caches.'}
            </span>
            <span className="empty-actions">
              {status.exists && (
                <button type="button" className="btn btn-soft" onClick={onRun}>
                  Run
                </button>
              )}
              <button type="button" className="btn btn-soft" onClick={onEdit}>
                {status.exists ? 'Edit' : 'Create script'}
              </button>
              <button type="button" className="btn btn-soft" onClick={onAgent}>
                Write it with a chat
              </button>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
