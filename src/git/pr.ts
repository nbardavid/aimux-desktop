export interface Check {
  name: string
  state: 'passing' | 'failing' | 'pending' | 'skipped'
  /** Where the check's run lives; the PR's checks page when GitHub gives none. */
  url: string
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
  detailsUrl?: string
  targetUrl?: string
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

const PASSING = new Set(['SUCCESS', 'NEUTRAL'])
const FAILING = new Set(['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED'])

function checkState(check: RawCheck): Check['state'] {
  // A CheckRun has a conclusion once it completes; a StatusContext only has a state.
  const verdict = check.conclusion ?? check.state ?? ''
  if (PASSING.has(verdict)) return 'passing'
  if (verdict === 'SKIPPED') return 'skipped'
  if (FAILING.has(verdict)) return 'failing'
  return 'pending'
}

function prState(pr: RawPr): PullRequest['state'] {
  if (pr.state === 'MERGED') return 'Merged'
  if (pr.state === 'CLOSED') return 'Closed'
  return pr.isDraft ? 'Draft' : 'Open'
}

/** Checks as the panel lists them: failed, running, passed, skipped; by name inside each. */
const CHECK_ORDER: Check['state'][] = ['failing', 'pending', 'passing', 'skipped']
export const sortChecks = (checks: readonly Check[]) =>
  checks.toSorted(
    (a, b) =>
      CHECK_ORDER.indexOf(a.state) - CHECK_ORDER.indexOf(b.state) || a.name.localeCompare(b.name)
  )

/** `gh pr view --json …` output. */
export function toPullRequest(raw: string): PullRequest {
  const pr = JSON.parse(raw) as RawPr
  return {
    additions: pr.additions,
    base: pr.baseRefName ?? '',
    body: pr.body,
    changedFiles: pr.changedFiles,
    checks: sortChecks(
      (pr.statusCheckRollup ?? []).map((check) => ({
        name: check.name ?? check.context ?? 'check',
        state: checkState(check),
        // An empty link counts as none.
        url:
          [check.detailsUrl, check.targetUrl].find((u) => u !== undefined && u !== '') ??
          `${pr.url}/checks`,
      }))
    ),
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
  /** One word, for a narrow panel: "Failing", "Ready"… (the label goes in its tooltip). */
  short: string
  tone: 'ok' | 'blocked' | 'neutral'
  action: 'merge' | 'cleanup' | null
  /** The status icon beside the label: a spinner while GitHub is still deciding. */
  icon: 'ready' | 'alert' | 'spinner' | 'draft' | 'merged' | 'closed'
}

/**
 * The TUI's headline for the merge box, in its order: a terminal state, then a hard blocker,
 * then what the checks are doing. Merged still offers something: cleaning the workspace up.
 */
export function prHeadline(pr: PullRequest): PrHeadline {
  if (pr.state === 'Merged')
    return { action: 'cleanup', icon: 'merged', label: 'Merged', short: 'Merged', tone: 'ok' }
  if (pr.state === 'Closed')
    return { action: null, icon: 'closed', label: 'Closed', short: 'Closed', tone: 'blocked' }
  if (pr.state === 'Draft')
    return { action: null, icon: 'draft', label: 'Draft', short: 'Draft', tone: 'neutral' }
  if (pr.mergeable === 'CONFLICTING')
    return {
      action: null,
      icon: 'alert',
      label: 'Merge conflicts',
      short: 'Conflicts',
      tone: 'blocked',
    }
  if (pr.checks.some((c) => c.state === 'pending')) {
    return {
      action: null,
      icon: 'spinner',
      label: 'Checks running',
      short: 'Running',
      tone: 'neutral',
    }
  }
  if (pr.mergeState === 'BLOCKED')
    return { action: null, icon: 'alert', label: 'Blocked', short: 'Blocked', tone: 'blocked' }
  if (pr.mergeState === 'BEHIND')
    return { action: null, icon: 'alert', label: 'Out of date', short: 'Behind', tone: 'blocked' }
  // UNSTABLE: a check that is not required failed; GitHub still lets you merge.
  if (pr.mergeState === 'UNSTABLE')
    return {
      action: 'merge',
      icon: 'alert',
      label: 'Checks failing',
      short: 'Failing',
      tone: 'blocked',
    }
  if (pr.mergeState === 'CLEAN')
    return { action: 'merge', icon: 'ready', label: 'Ready to merge', short: 'Ready', tone: 'ok' }
  return { action: null, icon: 'spinner', label: 'Checking…', short: 'Checking…', tone: 'neutral' }
}

/**
 * What stands between the PR and a safe merge: commits not pushed yet would be lost (the
 * merge takes GitHub's branch), and failing checks are asked about out loud.
 */
export function mergeGate(pr: PullRequest, ahead: number) {
  return {
    blocked: ahead > 0 ? 'Push first' : null,
    failing: pr.checks.some((c) => c.state === 'failing'),
  }
}

/** What the head's inline confirm asks about: merging the PR, deleting the workspace, or
 * deleting it anyway once git refused (uncommitted changes). */
export type HeadAsk =
  | { action: 'merge'; number: number; base: string; failing: boolean }
  | { action: 'cleanup'; uncommitted: number }
  | { action: 'cleanup-anyway' }

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

/**
 * The confirm names its action on its button ("Merge", "Clean up"): its text is the warnings
 * (`warn`), `long` from 340px of panel, `short` below, and `title` the whole question. A
 * merge with nothing to warn about says where it goes instead.
 */
export function confirmWords(
  ask: HeadAsk,
  claude: 'working' | 'waiting' | null
): { long: string; short: string; title: string; warn: boolean } {
  const long: string[] = []
  const short: string[] = []
  const said: string[] = []
  let question: string
  if (ask.action === 'merge') {
    question = `Merge #${ask.number} into ${ask.base}?`
    if (ask.failing) {
      long.push('Checks failing')
      short.push('Failing')
      said.push('Checks are failing.')
    }
  } else if (ask.action === 'cleanup') {
    question = 'Clean up this workspace? Its worktree folder is removed; the branch stays.'
    if (ask.uncommitted > 0) {
      long.push(plural(ask.uncommitted, 'uncommitted change'))
      short.push(`${ask.uncommitted} uncommitted`)
      said.push(`It has ${plural(ask.uncommitted, 'uncommitted change')}.`)
    }
  } else {
    question = 'The worktree has uncommitted changes. Deleting it anyway discards them.'
    long.push('Uncommitted changes')
    short.push('Uncommitted')
  }
  if (claude !== null) {
    long.push(`Claude is ${claude}`)
    short.push(`Claude ${claude}`)
    said.push(`Claude is ${claude}.`)
  }
  const title = [question, ...said].join(' ')
  if (long.length === 0 && ask.action === 'merge')
    return {
      long: `#${ask.number} into ${ask.base}`,
      short: `Into ${ask.base}`,
      title,
      warn: false,
    }
  return { long: long.join(' · '), short: short.join(' · '), title, warn: long.length > 0 }
}

/** git refused to remove a worktree because of what is in it: `--force` would. */
export const uncommittedRefusal = (error: string) => /modified|untracked|--force/.test(error)
