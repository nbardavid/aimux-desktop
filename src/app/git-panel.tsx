import { invoke } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import { ArrowUpIcon, ArrowUpRightIcon, GitBranchIcon, GitMergeIcon } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import type { BranchState, FileChange } from './use-git'

import { prHeadline, type PullRequest } from '../git/pr'
import { countClass, type FileActions, FileList } from './file-list'
import { dotClass } from './status-dot'

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

const CHECK_DOT = { failing: 'failing', passing: 'done', pending: 'working' } as const

const TONE = {
  blocked: 'text-[#a2301f]',
  neutral: 'text-muted-foreground',
  ok: 'text-[#2f6b3e]',
} as const

/** `.btn.head-btn`: the git head's compact buttons. */
const headBtn = 'h-[26px] flex-none px-[9px] text-[12.5px]'
/** `.btn-merge`: GitHub's green; no hover change while disabled. */
const merge = 'bg-[#2f8a4c] text-white hover:bg-[#2f8a4c] hover:not-disabled:bg-[#287a42]'
const icon = 'size-3.5 shrink-0'
const quiet = 'text-faint px-3 py-8 text-center'

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
  const yes = useRef<HTMLButtonElement>(null)
  const actionButton = useRef<HTMLButtonElement>(null)
  // The question takes the focus: Enter says Yes, Esc says No.
  useEffect(() => {
    if (asking) yes.current?.focus()
  }, [asking])
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
    <Button
      type="button"
      variant="secondary"
      className={headBtn}
      disabled={busy !== null}
      onClick={() => void run('push', async () => invoke('git_push', { path }))}
    >
      <ArrowUpIcon className={icon} />
      {busy === 'push' ? 'Pushing…' : pushLabel}
    </Button>
  )

  const cancel = () => {
    setAsking(false)
    // Back on the button that asked, not lost on the page.
    requestAnimationFrame(() => actionButton.current?.focus())
  }

  // Row 1: the PR and what it says, never cut short. Row 2, when the panel is too narrow for
  // one row: Push and Merge on the right, or the question that replaces them.
  return (
    <div
      className="flex min-h-bar flex-none flex-wrap items-center gap-x-2 gap-y-1.5 border-b py-1.5 pr-2 pl-3"
      data-tauri-drag-region
    >
      {pr && headline ? (
        <span className="flex flex-none items-center gap-2" data-tauri-drag-region>
          <button
            type="button"
            className="inline-flex h-6 items-center gap-1 rounded-md bg-[color-mix(in_srgb,var(--good)_12%,var(--background))] pr-[7px] pl-2 font-mono text-[12px] font-semibold text-[#2f6b3e] hover:bg-[color-mix(in_srgb,var(--good)_20%,var(--background))]"
            onClick={() => void openUrl(pr.url)}
          >
            #{pr.number}
            <ArrowUpRightIcon className={icon} />
          </button>
          <span className={cn('text-sm font-medium whitespace-nowrap', TONE[headline.tone])}>
            {headline.label}
          </span>
        </span>
      ) : (
        <span className="text-muted-foreground inline-flex min-w-0 flex-1 items-center gap-1.5 font-mono text-[12px]">
          <GitBranchIcon className={icon} />
          <span className="truncate">{branch?.branch ?? 'detached'}</span>
          {ahead > 0 && <span className="text-faint">↑{ahead}</span>}
          {(branch?.behind ?? 0) > 0 && <span className="text-faint">↓{branch?.behind}</span>}
        </span>
      )}
      {!asking && (push !== false || (pr && action !== null && path !== undefined)) && (
        <span className="ml-auto flex flex-none items-center gap-2">
          {push}
          {pr && action !== null && path !== undefined && (
            <Button
              ref={actionButton}
              type="button"
              variant={action === 'merge' ? 'default' : 'secondary'}
              className={cn(headBtn, action === 'merge' && merge)}
              disabled={busy !== null}
              onClick={() => setAsking(true)}
            >
              {action === 'merge' && <GitMergeIcon className={icon} />}
              {action === 'merge' ? 'Merge' : (cleanup?.label ?? 'Clean up')}
            </Button>
          )}
        </span>
      )}
      {pr && asking && path !== undefined && (
        <span
          className="animate-in fade-in slide-in-from-bottom-[6px] ml-auto inline-flex flex-none items-center gap-1.5 text-[12.5px] font-medium duration-160 ease-[cubic-bezier(0.2,0,0,1)]"
          role="group"
          aria-label={action === 'merge' ? `Merge #${pr.number}?` : `${cleanup?.label}?`}
          onKeyDown={(e) => {
            if (e.key !== 'Escape') return
            // Esc says No, and goes no further (it would stop a working chat).
            e.preventDefault()
            e.stopPropagation()
            cancel()
          }}
        >
          {action === 'merge' ? 'Merge?' : `${cleanup?.label}?`}
          <Button type="button" variant="secondary" className={headBtn} onClick={cancel}>
            No
          </Button>
          <Button
            ref={yes}
            type="button"
            className={cn(headBtn, action === 'merge' && merge)}
            disabled={busy !== null}
            onClick={() =>
              void run(action ?? '', async () =>
                action === 'merge' ? invoke('pr_merge', { path }) : cleanup?.run()
              )
            }
          >
            {busy === null ? 'Yes' : 'Working…'}
          </Button>
        </span>
      )}
    </div>
  )
}

function Tab({
  active,
  count,
  label,
  onSelect,
}: {
  active: boolean
  count: number
  label: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={cn(
        'flex h-7 items-center gap-1.5 rounded-[8px] px-2.5 font-medium whitespace-nowrap transition-[background-color,color] duration-120',
        active ? 'bg-pill text-foreground' : 'text-faint hover:text-foreground'
      )}
      onClick={onSelect}
    >
      {label}
      {count > 0 && <span className={countClass}>{count}</span>}
    </button>
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
    <aside className="bg-side flex min-h-0 flex-none flex-col" aria-label="Git" style={{ width }}>
      <Head
        path={path}
        pr={pr}
        branch={props.branch}
        cleanup={props.cleanup}
        onChanged={props.onChanged}
        onError={props.onError}
      />
      <div
        className="flex h-bar flex-none items-center gap-0.5 px-2"
        role="tablist"
        aria-label="Git view"
      >
        <Tab
          active={shown === 'changes'}
          label="Changes"
          count={changes?.length ?? 0}
          onSelect={() => setView('changes')}
        />
        {pr && (
          <Tab
            active={shown === 'checks'}
            label="Checks"
            count={pr.checks.length}
            onSelect={() => setView('checks')}
          />
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-2 pt-0.5 pb-3">
        {shown === 'changes' &&
          (changes ? (
            <FileList changes={changes} onOpen={onOpenFile} actions={actions} />
          ) : (
            <div className={quiet}>{changes === null ? 'Not a git repository' : 'Reading…'}</div>
          ))}
        {shown === 'checks' && pr && (
          <div className="flex flex-col gap-2.5 px-2.5 py-1.5">
            <div className="text-[15px] leading-[1.35] font-semibold">{pr.title}</div>
            <div className="text-muted-foreground font-mono text-[11px]">
              <span className="text-good">+{pr.additions}</span>{' '}
              <span className="text-critical">−{pr.deletions}</span> · {pr.changedFiles} files ·{' '}
              {pr.head} → {pr.base}
            </div>
            {pr.checks.length > 0 ? (
              <div className="flex flex-col border-y py-1">
                {pr.checks.map((check) => (
                  <div className="flex h-[26px] items-center gap-2 text-[12.5px]" key={check.name}>
                    <span className={dotClass(CHECK_DOT[check.state])} />
                    <span className="min-w-0 flex-1">{check.name}</span>
                    <span className="text-faint text-[11.5px]">{check.state}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className={quiet}>No checks on this pull request</div>
            )}
            {pr.body !== '' && (
              <div className="text-muted-foreground max-h-[260px] overflow-auto text-[12.5px] leading-[1.55] whitespace-pre-wrap select-text">
                {pr.body}
              </div>
            )}
          </div>
        )}
      </div>
      {setup}
    </aside>
  )
}
