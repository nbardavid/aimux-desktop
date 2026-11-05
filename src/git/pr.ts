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
    body: pr.body,
    changedFiles: pr.changedFiles,
    checks: (pr.statusCheckRollup ?? []).map((check) => ({
      name: check.name ?? check.context ?? 'check',
      state: checkState(check),
    })),
    deletions: pr.deletions,
    number: pr.number,
    state: prState(pr),
    title: pr.title,
    url: pr.url,
  }
}
