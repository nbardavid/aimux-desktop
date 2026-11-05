import { invoke } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import { type ReactNode, useState } from 'react'

import type { BranchState, FileChange } from './use-git'

import { prHeadline, type PullRequest } from '../git/pr'
import { type FileActions, FileList } from './file-list'
import { Icon } from './icons'

interface Props {
  width: number
  path: string | undefined
  changes: FileChange[] | null | undefined
  pr: PullRequest | null
  branch: BranchState | null
  /** What "clean up" does once the PR is merged: delete the worktree, or leave the branch. */
  cleanup: { label: string; run: () => Promise<void> } | null
  onOpenFile: (file: FileChange) => void
  /** Something changed on disk or on GitHub: read it all again. */
  onChanged: () => void
  onError: (message: string) => void
  setup: ReactNode
}

const CHECK_DOT = { failing: 'st-failing', passing: 'st-done', pending: 'st-working' } as const

/** The PR at the top right, as Conductor puts it: number, headline, and its one action. */
function Head({
  branch,
  cleanup,
  onChanged,
  onError,
  path,
  pr,
}: Pick<Props, 'branch' | 'cleanup' | 'onChanged' | 'onError' | 'path' | 'pr'>) {
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const headline = pr ? prHeadline(pr) : null
  const action =
    headline?.action === 'cleanup' && cleanup === null ? null : (headline?.action ?? null)

  const run = async (what: string, job: () => Promise<unknown>) => {
    setBusy(what)
    try {
      await job()
      onChanged()
    } catch (error) {
      onError(String(error))
    } finally {
      setBusy(null)
      setAsking(false)
    }
  }

  const ahead = branch?.ahead ?? 0
  const unpublished = branch !== null && branch.branch !== null && !branch.upstream
  const pushLabel = unpublished ? 'Publish' : `Push ${ahead}`
  const push = path !== undefined && branch?.remote === true && (ahead > 0 || unpublished) && (
    <button
      type="button"
      className="btn btn-soft head-btn"
      disabled={busy !== null}
      onClick={() => void run('push', async () => invoke('git_push', { path }))}
    >
      <Icon name="arrowUp" small />
      {busy === 'push' ? 'Pushing…' : pushLabel}
    </button>
  )

  return (
    <div className="git-head" data-tauri-drag-region>
      {pr && headline ? (
        <>
          <button type="button" className="pr-chip" onClick={() => void openUrl(pr.url)}>
            #{pr.number}
            <Icon name="external" small />
          </button>
          <span className={`pr-state tone-${headline.tone}`}>{headline.label}</span>
        </>
      ) : (
        <span className="head-branch">
          <Icon name="branch" small />
          <span className="head-name">{branch?.branch ?? 'detached'}</span>
          {ahead > 0 && <span className="faint">↑{ahead}</span>}
          {(branch?.behind ?? 0) > 0 && <span className="faint">↓{branch?.behind}</span>}
        </span>
      )}
      <span className="grow" data-tauri-drag-region />
      {push}
      {pr && action !== null && path !== undefined && !asking && (
        <button
          type="button"
          className={action === 'merge' ? 'btn btn-merge head-btn' : 'btn btn-soft head-btn'}
          disabled={busy !== null}
          onClick={() => setAsking(true)}
        >
          {action === 'merge' && <Icon name="merge" small />}
          {action === 'merge' ? 'Merge' : (cleanup?.label ?? 'Clean up')}
        </button>
      )}
      {pr && asking && path !== undefined && (
        <span className="head-ask">
          {action === 'merge' ? `Merge #${pr.number}?` : `${cleanup?.label}?`}
          <button type="button" className="btn btn-soft head-btn" onClick={() => setAsking(false)}>
            No
          </button>
          <button
            type="button"
            className={action === 'merge' ? 'btn btn-merge head-btn' : 'btn btn-ink head-btn'}
            disabled={busy !== null}
            onClick={() =>
              void run(action ?? '', async () =>
                action === 'merge' ? invoke('pr_merge', { path }) : cleanup?.run()
              )
            }
          >
            {busy === null ? 'Yes' : 'Working…'}
          </button>
        </span>
      )}
    </div>
  )
}

export function GitPanel(props: Props) {
  const { changes, onOpenFile, path, pr, setup, width } = props
  const [view, setView] = useState<'changes' | 'checks'>('changes')
  const shown = pr ? view : 'changes'

  const write = (command: string, args: Record<string, unknown>) => {
    if (path === undefined) return
    invoke(command, { path, ...args }).then(props.onChanged, (error: unknown) =>
      props.onError(String(error))
    )
  }
  const actions: FileActions = {
    discard: (file) => write('git_discard', { file: file.path, untracked: file.untracked }),
    stage: (files) =>
      write('git_stage', { all: files === 'all', files: files === 'all' ? [] : files }),
    unstage: (files) =>
      write('git_unstage', { all: files === 'all', files: files === 'all' ? [] : files }),
  }

  return (
    <aside className="git" aria-label="Git" style={{ width }}>
      <Head
        path={path}
        pr={pr}
        branch={props.branch}
        cleanup={props.cleanup}
        onChanged={props.onChanged}
        onError={props.onError}
      />
      <div className="panel-tabs" role="tablist" aria-label="Git view">
        <button
          type="button"
          role="tab"
          aria-selected={shown === 'changes'}
          className={shown === 'changes' ? 'panel-tab is-active' : 'panel-tab'}
          onClick={() => setView('changes')}
        >
          Changes
          {(changes?.length ?? 0) > 0 && <span className="count">{changes?.length}</span>}
        </button>
        {pr && (
          <button
            type="button"
            role="tab"
            aria-selected={shown === 'checks'}
            className={shown === 'checks' ? 'panel-tab is-active' : 'panel-tab'}
            onClick={() => setView('checks')}
          >
            Checks
            {pr.checks.length > 0 && <span className="count">{pr.checks.length}</span>}
          </button>
        )}
      </div>
      <div className="git-scroll">
        {shown === 'changes' &&
          (changes ? (
            <FileList changes={changes} onOpen={onOpenFile} actions={actions} />
          ) : (
            <div className="quiet">{changes === null ? 'Not a git repository' : 'Reading…'}</div>
          ))}
        {shown === 'checks' && pr && (
          <div className="gh">
            <div className="gh-title">{pr.title}</div>
            <div className="gh-meta">
              <span className="add">+{pr.additions}</span>{' '}
              <span className="del">−{pr.deletions}</span> · {pr.changedFiles} files · {pr.head} →{' '}
              {pr.base}
            </div>
            {pr.checks.length > 0 ? (
              <div className="checks">
                {pr.checks.map((check) => (
                  <div className="check-row" key={check.name}>
                    <span className={`st ${CHECK_DOT[check.state]}`} />
                    <span className="grow">{check.name}</span>
                    <span className="faint">{check.state}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="quiet">No checks on this pull request</div>
            )}
            {pr.body !== '' && <div className="gh-body">{pr.body}</div>}
          </div>
        )}
      </div>
      {setup}
    </aside>
  )
}
