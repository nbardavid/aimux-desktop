export interface Check {
  name: string
  state: 'passing' | 'failing' | 'pending'
}

export interface PullRequest {
  number: number
  title: string
  url: string
  state: 'Draft' | 'Open' | 'Merged' | 'Closed'
  additions: number
  deletions: number
  changedFiles: number
  body: string
  checks: Check[]
  /** GitHub's own words: `CONFLICTING`, `CLEAN`, `BLOCKED`, `BEHIND`, `UNSTABLE`… */
  mergeable: string
  mergeState: string
  base: string
  head: string
}

interface RawCheck {
  name?: string
  context?: string
  status?: string
  conclusion?: string
  state?: string
}

interface RawPr {
  number: number
  title: string
  url: string
  state: string
  isDraft: boolean
  additions: number
  deletions: number
  changedFiles: number
  body: string
  statusCheckRollup?: RawCheck[] | null
  mergeable?: string
  mergeStateStatus?: string
  baseRefName?: string
  headRefName?: string
}

const PASSING = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED'])
const FAILING = new Set(['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED'])

function checkState(check: RawCheck): Check['state'] {
  // A CheckRun has a conclusion once it completes; a StatusContext only has a state.
  const verdict = check.conclusion ?? check.state ?? ''
  if (PASSING.has(verdict)) return 'passing'
  if (FAILING.has(verdict)) return 'failing'
  return 'pending'
}

function prState(pr: RawPr): PullRequest['state'] {
  if (pr.state === 'MERGED') return 'Merged'
  if (pr.state === 'CLOSED') return 'Closed'
  return pr.isDraft ? 'Draft' : 'Open'
}

/** `gh pr view --json …` output. */
export function toPullRequest(raw: string): PullRequest {
  const pr = JSON.parse(raw) as RawPr
  return {
    additions: pr.additions,
    base: pr.baseRefName ?? '',
    body: pr.body,
    changedFiles: pr.changedFiles,
    checks: (pr.statusCheckRollup ?? []).map((check) => ({
      name: check.name ?? check.context ?? 'check',
      state: checkState(check),
    })),
    deletions: pr.deletions,
    head: pr.headRefName ?? '',
    mergeable: pr.mergeable ?? '',
    mergeState: pr.mergeStateStatus ?? '',
    number: pr.number,
    state: prState(pr),
    title: pr.title,
    url: pr.url,
  }
}

export interface PrHeadline {
  label: string
  tone: 'ok' | 'blocked' | 'neutral'
  action: 'merge' | 'cleanup' | null
}

/**
 * The TUI's headline for the merge box, in its order: a terminal state, then a hard blocker,
 * then what the checks are doing. Merged still offers something: cleaning the workspace up.
 */
export function prHeadline(pr: PullRequest): PrHeadline {
  if (pr.state === 'Merged') return { action: 'cleanup', label: 'Merged', tone: 'ok' }
  if (pr.state === 'Closed') return { action: null, label: 'Closed', tone: 'blocked' }
  if (pr.state === 'Draft') return { action: null, label: 'Draft', tone: 'neutral' }
  if (pr.mergeable === 'CONFLICTING')
    return { action: null, label: 'Merge conflicts', tone: 'blocked' }
  if (pr.checks.some((c) => c.state === 'pending')) {
    return { action: null, label: 'Checks running', tone: 'neutral' }
  }
  if (pr.mergeState === 'BLOCKED') return { action: null, label: 'Blocked', tone: 'blocked' }
  if (pr.mergeState === 'BEHIND') return { action: null, label: 'Out of date', tone: 'blocked' }
  // UNSTABLE: a check that is not required failed; GitHub still lets you merge.
  if (pr.mergeState === 'UNSTABLE')
    return { action: 'merge', label: 'Checks failing', tone: 'blocked' }
  if (pr.mergeState === 'CLEAN') return { action: 'merge', label: 'Ready to merge', tone: 'ok' }
  return { action: null, label: 'Checking…', tone: 'neutral' }
}
