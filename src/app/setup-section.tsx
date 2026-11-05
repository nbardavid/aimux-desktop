import type { SetupStatus } from './use-setup'

interface Props {
  status: SetupStatus | null
  workspaceId: string | null
  workspaceName: string
  onEdit: () => void
  onRun: () => void
  onAgent: () => void
}

function lastRun(status: SetupStatus, workspaceId: string | null) {
  const run = workspaceId === null ? undefined : status.runs[workspaceId]
  if (!run || run.ranAt === null) return { dot: 'st-idle', text: 'Not run' }
  if (run.exitCode === 0) return { dot: 'st-done', text: 'Ran fine' }
  return { dot: 'st-failing', text: `Exit ${run.exitCode ?? '?'}` }
}

/** The TUI's setup widget: what a fresh worktree lacks, installed by one script per project. */
export function SetupSection({
  onAgent,
  onEdit,
  onRun,
  status,
  workspaceId,
  workspaceName,
}: Props) {
  if (status === null) return null
  const run = lastRun(status, workspaceId)
  // A project with no workspace records has no worktree for the script to run in.
  const inWorkspace = workspaceId !== null
  return (
    <div className="setup">
      <div className="setup-head">
        {status.exists ? (
          <span className="status">
            <span className={`st ${run.dot}`} />
            {run.text}
          </span>
        ) : (
          <span>No setup script</span>
        )}
        <span className="mono faint">{workspaceName}</span>
      </div>
      <div className="setup-actions">
        {status.exists && inWorkspace && (
          <button type="button" className="btn btn-outline" onClick={onRun}>
            Run
          </button>
        )}
        <button type="button" className="btn btn-outline" onClick={onEdit}>
          {status.exists ? 'Edit' : 'Create'}
        </button>
        {inWorkspace && (
          <button type="button" className="btn btn-outline" onClick={onAgent}>
            Write it with an agent
          </button>
        )}
      </div>
      <div className="setup-text">
        {status.exists
          ? 'Runs in each new workspace the TUI sees created.'
          : 'A setup script installs what a fresh worktree lacks: dependencies, .env, caches.'}
      </div>
    </div>
  )
}
