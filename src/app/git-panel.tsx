import { invoke } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import {
  ArrowUpIcon,
  ArrowUpRightIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  CircleSlashIcon,
  CircleXIcon,
  FolderXIcon,
  GitBranchIcon,
  GitMergeIcon,
  GitPullRequestIcon,
} from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import type { BranchState, FileChange } from './use-git'

import {
  type Check,
  confirmWords,
  type HeadAsk,
  mergeGate,
  type PrHeadline,
  prHeadline,
  type PullRequest,
  uncommittedRefusal,
} from '../git/pr'
import { countClass, Empty, type FileActions, FileList } from './file-list'
import { Dot } from './status-dot'

interface Props {
  /** Pixels once dragged, or a CSS width that follows the window. */
  width: number | string
  path: string | undefined
  changes: FileChange[] | null | undefined
  pr: PullRequest | null
  branch: BranchState | null
  /**
   * What "clean up" does once the PR is merged: delete the worktree. `force` only after git
   * refused (uncommitted changes) and the user said "Delete anyway".
   */
  cleanup: { label: string; run: (force: boolean) => Promise<void> } | null
  onOpenFile: (file: FileChange) => void
  /** Something changed on disk or on GitHub: read it all again. */
  onChanged: () => void
  /** What failed ("Couldn't push"), and why. */
  onError: (title: string, error: unknown) => void
  /** A chat of this workspace is working or waiting: its questions say so. */
  claude: 'working' | 'waiting' | null
  /** No PR yet: hand "open one" to this workspace's chat (the app itself never creates one). */
  onAskPr: () => void
  setup: ReactNode
}

/** The band, its hairline, the chip's border and the ink, by the PR's tone. */
const TONE = {
  blocked: {
    band: 'bg-critical-wash border-[color:color-mix(in_srgb,var(--critical)_18%,var(--border))]',
    chip: 'border-[color:color-mix(in_srgb,var(--critical)_30%,transparent)]',
    ink: 'text-critical-ink',
  },
  neutral: {
    band: 'bg-chrome',
    chip: 'border-[color:color-mix(in_srgb,var(--faint)_30%,transparent)]',
    ink: 'text-muted-foreground',
  },
  ok: {
    band: 'bg-good-wash border-[color:color-mix(in_srgb,var(--good)_18%,var(--border))]',
    chip: 'border-[color:color-mix(in_srgb,var(--good)_30%,transparent)]',
    ink: 'text-good-ink',
  },
} as const

/** The working status loader, centred in a 14px icon's box. */
const spinner = (
  <span className="grid size-3.5 flex-none place-items-center">
    <Dot tone="working" />
  </span>
)

const HEAD_ICON = {
  alert: CircleAlertIcon,
  closed: CircleSlashIcon,
  draft: CircleDashedIcon,
  merged: GitMergeIcon,
  ready: CircleCheckIcon,
} as const

function HeadIcon({ icon }: { icon: PrHeadline['icon'] }) {
  if (icon === 'spinner') return spinner
  const Icon = HEAD_ICON[icon]
  return <Icon className={iconClass} />
}

/** `.btn-merge`: GitHub's green; no hover change while disabled. */
const merge = 'bg-merge text-white hover:bg-merge hover:not-disabled:bg-merge-hover px-2.5'
const iconClass = 'size-3.5 shrink-0'
/** Inline confirmations swap in place: a fade, no movement. */
const swap = 'animate-in fade-in duration-120 ease-out'

/**
 * The PR at the top right, as Conductor puts it: one 40px row tinted by the PR's state, its
 * number, its headline, and its one action. Never wraps: the headline truncates first.
 */
function Head({
  branch,
  changes,
  claude,
  cleanup,
  onAskPr,
  onChanged,
  onError,
  path,
  pr,
}: Pick<
  Props,
  'branch' | 'changes' | 'claude' | 'cleanup' | 'onAskPr' | 'onChanged' | 'onError' | 'path' | 'pr'
>) {
  const [asking, setAsking] = useState(false)
  // git refused to delete the worktree (uncommitted changes): the question is now "anyway".
  const [refused, setRefused] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const yes = useRef<HTMLButtonElement>(null)
  const no = useRef<HTMLButtonElement>(null)
  const actionButton = useRef<HTMLButtonElement>(null)
  // Once a question was asked, the buttons fade back in when it goes; not on first show.
  const asked = useRef(false)
  if (asking) asked.current = true
  const headline = pr ? prHeadline(pr) : null
  const tone = TONE[headline?.tone ?? 'neutral']
  // A grey secondary button vanishes on a tinted band: it gets the PR chip's white instead.
  const onWash =
    headline !== null && headline.tone !== 'neutral' ? 'bg-white/70 hover:bg-white' : undefined
  const action =
    headline?.action === 'cleanup' && cleanup === null ? null : (headline?.action ?? null)

  const run = async (what: string, failed: string, job: () => Promise<unknown>) => {
    setBusy(what)
    try {
      await job()
      onChanged()
      setAsking(false)
    } catch (error) {
      // The sidebar's flow: a refusal over uncommitted changes asks "Delete anyway" in place.
      if (what === 'cleanup' && !refused && uncommittedRefusal(String(error))) setRefused(true)
      else {
        onError(failed, error)
        setAsking(false)
      }
    } finally {
      setBusy(null)
    }
  }

  const ahead = branch?.ahead ?? 0
  const unpublished = branch !== null && branch.branch !== null && !branch.upstream
  const gate = pr ? mergeGate(pr, ahead) : null
  /** Why Merge cannot be pressed yet. */
  const blocked = action === 'merge' ? (gate?.blocked ?? null) : null
  const failing = action === 'merge' && gate?.failing === true
  const cautious = failing || action === 'cleanup'
  // The question takes the focus: Enter says Yes, Esc says No. A risky one (failing checks,
  // deleting the workspace) focuses No: Enter alone never does it.
  useEffect(() => {
    if (asking) (cautious ? no : yes).current?.focus()
  }, [asking, cautious, refused])
  useEffect(() => {
    if (!asking) setRefused(false)
  }, [asking])
  let ask: HeadAsk = { action: 'cleanup', uncommitted: changes?.length ?? 0 }
  if (refused) ask = { action: 'cleanup-anyway' }
  if (action === 'merge') ask = { action, base: pr?.base ?? '', failing, number: pr?.number ?? 0 }
  const words = confirmWords(ask, claude)
  let yesLabel = action === 'merge' ? 'Merge' : 'Clean up'
  if (refused) yesLabel = 'Delete anyway'
  if (busy !== null) yesLabel = 'Working…'
  // Below 380px of panel (24vw at 1440 included), the arrow and the count say it: the PR's
  // status gets the room to read in full.
  let pushText: ReactNode = (
    <span>
      <span className="@max-[380px]:hidden">Push </span>
      {ahead}
    </span>
  )
  if (unpublished) pushText = 'Publish'
  if (busy === 'push') pushText = <span className="@max-[380px]:hidden">Pushing…</span>
  // Once merged, the branch is GitHub's past: pushing to it would only reopen questions.
  const push = path !== undefined &&
    branch?.remote === true &&
    (ahead > 0 || unpublished) &&
    pr?.state !== 'Merged' && (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className={cn(onWash, !unpublished && '@max-[380px]:px-2')}
        aria-label={unpublished ? 'Publish the branch' : `Push ${ahead}`}
        disabled={busy !== null}
        onClick={() =>
          void run(
            'push',
            unpublished ? "Couldn't publish the branch" : "Couldn't push",
            async () => invoke('git_push', { path })
          )
        }
      >
        <ArrowUpIcon />
        {pushText}
      </Button>
    )

  // A branch with work on it (published, or commits to push) and no PR: Claude opens it.
  const askPr = !pr &&
    path !== undefined &&
    branch?.remote === true &&
    branch.branch !== null &&
    (branch.upstream || ahead > 0) && (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        aria-label="Ask Claude to open a PR"
        data-tip="Ask Claude to open a PR"
        data-tip-align="end"
        onClick={onAskPr}
      >
        <GitPullRequestIcon />
        Ask for PR
      </Button>
    )

  const cancel = () => {
    setAsking(false)
    // Back on the button that asked, not lost on the page.
    requestAnimationFrame(() => actionButton.current?.focus())
  }

  return (
    <div
      className={cn(
        'flex h-bar flex-none items-center gap-2 border-b pr-2 pl-3 transition-[background-color,border-color] duration-160 ease-out',
        tone.band
      )}
      data-tauri-drag-region
    >
      {pr && asking && (
        // The question names its action on its button: here, only what to know first.
        <span
          className={cn(
            'min-w-0 flex-1 truncate font-medium',
            words.warn ? 'text-critical-ink' : 'text-muted-foreground',
            swap
          )}
          title={words.title}
          data-tauri-drag-region
        >
          <span className="@max-[340px]:hidden">{words.long}</span>
          <span className="hidden @max-[340px]:inline">{words.short}</span>
        </span>
      )}
      {pr && headline && !asking && (
        <>
          <button
            type="button"
            className={cn(
              'inline-flex h-6 flex-none items-center gap-1 rounded-md border bg-white/70 pr-1.5 pl-2 text-sm font-semibold tabular-nums transition-colors duration-120 ease-out hover:bg-white',
              tone.chip,
              tone.ink
            )}
            aria-label={`Open #${pr.number} on GitHub`}
            onClick={() => void openUrl(pr.url)}
          >
            #{pr.number}
            <ArrowUpRightIcon className="size-3" />
          </button>
          <span
            className={cn('flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden', tone.ink)}
            data-tauri-drag-region
          >
            <HeadIcon icon={headline.icon} />
            {/* Below 340px of panel, one word ("Failing"); the tip says it whole. */}
            <span
              className="truncate text-base font-medium"
              data-tauri-drag-region
              title={headline.label}
            >
              <span className="@max-[340px]:hidden">{headline.label}</span>
              <span className="hidden @max-[340px]:inline">{headline.short}</span>
            </span>
          </span>
        </>
      )}
      {!pr && (
        <span
          className="text-muted-foreground flex min-w-0 flex-1 items-center gap-1.5"
          data-tauri-drag-region
        >
          <GitBranchIcon className={iconClass} />
          <span className="truncate font-mono text-xs">{branch?.branch ?? 'detached'}</span>
          {/* The Push button says it already. */}
          {ahead > 0 && push === false && (
            <span className="text-faint flex-none font-mono text-xs">↑{ahead}</span>
          )}
          {(branch?.behind ?? 0) > 0 && (
            <span className="text-faint flex-none font-mono text-xs">↓{branch?.behind}</span>
          )}
        </span>
      )}
      {!asking &&
        (push !== false || askPr !== false || (pr && action !== null && path !== undefined)) && (
          <span className={cn('flex flex-none items-center gap-1.5', asked.current && swap)}>
            {push}
            {askPr}
            {pr && action !== null && path !== undefined && (
              // A disabled button gets no hover of its own: the tip says why on its wrapper.
              <span className="flex" data-tip={blocked ?? undefined} data-tip-align="end">
                <Button
                  ref={actionButton}
                  type="button"
                  variant={action === 'merge' ? 'default' : 'secondary'}
                  size="sm"
                  className={cn(action === 'merge' ? merge : onWash)}
                  disabled={busy !== null || blocked !== null}
                  onClick={() => setAsking(true)}
                >
                  {/* Narrow, the word alone: the PR's status keeps its room. */}
                  {action === 'merge' && <GitMergeIcon className="@max-[380px]:hidden" />}
                  {action === 'merge' ? 'Merge' : (cleanup?.label ?? 'Clean up')}
                </Button>
              </span>
            )}
          </span>
        )}
      {pr && asking && path !== undefined && (
        <span
          className={cn('flex flex-none items-center gap-1.5', swap)}
          role="group"
          aria-label={words.title}
          onKeyDown={(e) => {
            if (e.key !== 'Escape') return
            // Esc says No, and goes no further (it would stop a working chat).
            e.preventDefault()
            e.stopPropagation()
            cancel()
          }}
        >
          <Button
            ref={no}
            type="button"
            variant="secondary"
            size="sm"
            className={onWash}
            onClick={cancel}
          >
            No
          </Button>
          <Button
            ref={yes}
            type="button"
            variant={cautious ? 'destructive' : 'default'}
            size="sm"
            className={cn(action === 'merge' && !failing && merge)}
            title={words.title}
            disabled={busy !== null}
            onClick={() =>
              void run(
                action ?? '',
                action === 'merge'
                  ? `Couldn't merge #${pr.number}`
                  : `Couldn't ${(cleanup?.label ?? 'clean up').toLowerCase()}`,
                async () =>
                  action === 'merge' ? invoke('pr_merge', { path }) : cleanup?.run(refused)
              )
            }
          >
            {yesLabel}
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
        'flex h-7 items-center gap-1 rounded-md px-2.5 text-sm whitespace-nowrap transition-colors duration-120 ease-out',
        active ? 'bg-muted text-foreground font-medium' : 'text-faint hover:text-muted-foreground'
      )}
      onClick={onSelect}
    >
      {label}
      {count > 0 && <span className={countClass}>{count}</span>}
    </button>
  )
}

const CHECK_WORD = {
  failing: 'failed',
  passing: 'passed',
  pending: 'running',
  skipped: 'skipped',
} as const

function CheckIcon({ state }: { state: Check['state'] }) {
  if (state === 'pending') return spinner
  if (state === 'skipped') return <CircleSlashIcon className={cn(iconClass, 'text-faint')} />
  return state === 'passing' ? (
    <CircleCheckIcon className={cn(iconClass, 'text-good')} />
  ) : (
    <CircleXIcon className={cn(iconClass, 'text-critical')} />
  )
}

/** The PR's title and numbers, then each check (a click opens its run), then its body. */
function Checks({ pr }: { pr: PullRequest }) {
  return (
    <>
      <div className="px-3 pt-3 pb-1 text-[15px] leading-[22px] font-semibold select-text">
        {pr.title}
      </div>
      <div className="text-faint px-3 pb-2 text-xs">
        <span className="font-mono tabular-nums">
          <span className="text-good">+{pr.additions}</span>{' '}
          <span className="text-critical">−{pr.deletions}</span>
        </span>
        {` · ${pr.changedFiles} ${pr.changedFiles === 1 ? 'file' : 'files'} · `}
        <span className="font-mono">
          {pr.head} → {pr.base}
        </span>
      </div>
      {pr.checks.length > 0 ? (
        pr.checks.map((check) => (
          <button
            type="button"
            key={check.name}
            className="group/check hover:bg-hover flex h-8 w-full items-center gap-2 rounded-md px-3 transition-colors duration-120 ease-out"
            aria-label={`${check.name}, ${CHECK_WORD[check.state]}: open on GitHub`}
            onClick={() => void openUrl(check.url)}
          >
            <CheckIcon state={check.state} />
            <span className="min-w-0 flex-1 truncate">{check.name}</span>
            <span className="text-faint grid flex-none text-xs">
              <span className="col-start-1 row-start-1 transition-opacity duration-120 ease-out group-hover/check:opacity-0 group-focus-visible/check:opacity-0">
                {CHECK_WORD[check.state]}
              </span>
              <ArrowUpRightIcon className="col-start-1 row-start-1 size-3 self-center justify-self-end opacity-0 transition-opacity duration-120 ease-out group-hover/check:opacity-100 group-focus-visible/check:opacity-100" />
            </span>
          </button>
        ))
      ) : (
        <div className="text-faint p-6 text-center">No checks on this pull request</div>
      )}
      {pr.body !== '' && (
        <div className="text-muted-foreground max-h-[260px] overflow-auto p-3 leading-5 whitespace-pre-wrap select-text">
          {pr.body}
        </div>
      )}
    </>
  )
}

export function GitPanel(props: Props) {
  const { changes, onOpenFile, path, pr, setup, width } = props
  const [view, setView] = useState<'changes' | 'checks'>('changes')
  const shown = pr ? view : 'changes'

  const write = (failed: string, command: string, args: Record<string, unknown>) => {
    if (path === undefined) return
    invoke(command, { path, ...args }).then(props.onChanged, (error: unknown) =>
      props.onError(failed, error)
    )
  }
  const actions: FileActions = {
    discard: (file) =>
      write(`Couldn't discard ${file.path.split('/').pop() ?? file.path}`, 'git_discard', {
        file: file.path,
        untracked: file.untracked,
      }),
    stage: (files) =>
      write("Couldn't stage", 'git_stage', {
        all: files === 'all',
        files: files === 'all' ? [] : files,
      }),
    unstage: (files) =>
      write("Couldn't unstage", 'git_unstage', {
        all: files === 'all',
        files: files === 'all' ? [] : files,
      }),
  }

  return (
    <aside
      className="bg-side @container flex min-h-0 flex-none flex-col"
      aria-label="Git"
      style={{ width }}
    >
      <Head
        path={path}
        pr={pr}
        branch={props.branch}
        cleanup={props.cleanup}
        onChanged={props.onChanged}
        onError={props.onError}
        claude={props.claude}
        changes={changes}
        onAskPr={props.onAskPr}
      />
      <div
        className="flex h-10 flex-none items-center gap-0.5 px-2"
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
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-2 pb-3">
        {shown === 'changes' && changes && (
          <FileList changes={changes} onOpen={onOpenFile} actions={actions} />
        )}
        {shown === 'changes' && changes === null && (
          <Empty icon={FolderXIcon} text="Not a git repository" />
        )}
        {shown === 'changes' && changes === undefined && (
          <div className="grid place-items-center pt-24" aria-label="Reading">
            {spinner}
          </div>
        )}
        {shown === 'checks' && pr && <Checks pr={pr} />}
      </div>
      {setup}
    </aside>
  )
}
