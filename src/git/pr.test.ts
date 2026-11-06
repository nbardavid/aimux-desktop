import { expect, test } from 'bun:test'

import { confirmWords, mergeGate, prHeadline, toPullRequest, uncommittedRefusal } from './pr'

const base = {
  additions: 55,
  body: 'b',
  changedFiles: 11,
  deletions: 7,
  isDraft: true,
  number: 165,
  state: 'OPEN',
  title: 't',
  url: 'u',
}

test('a draft with mixed checks', () => {
  const pr = toPullRequest(
    JSON.stringify({
      ...base,
      statusCheckRollup: [
        { conclusion: 'SUCCESS', detailsUrl: 'run/1', name: 'check', status: 'COMPLETED' },
        { conclusion: '', detailsUrl: '', name: 'e2e', status: 'IN_PROGRESS' },
        { context: 'ci/legacy', state: 'FAILURE', targetUrl: 'ci/7' },
      ],
    })
  )
  expect(pr.state).toBe('Draft')
  // No link of its own (or an empty one): the PR's checks page.
  // Failed first, then running, then passed.
  expect(pr.checks).toEqual([
    { name: 'ci/legacy', state: 'failing', url: 'ci/7' },
    { name: 'e2e', state: 'pending', url: 'u/checks' },
    { name: 'check', state: 'passing', url: 'run/1' },
  ])
})

test('merged wins over draft, no rollup means no checks', () => {
  const pr = toPullRequest(JSON.stringify({ ...base, state: 'MERGED', statusCheckRollup: null }))
  expect(pr.state).toBe('Merged')
  expect(pr.checks).toEqual([])
})

test('the headline follows the TUI: blockers before checks, merged offers clean-up', () => {
  const open = (extra: object) =>
    prHeadline(toPullRequest(JSON.stringify({ ...base, isDraft: false, ...extra })))
  expect(open({ mergeStateStatus: 'CLEAN' })).toEqual({
    action: 'merge',
    icon: 'ready',
    label: 'Ready to merge',
    short: 'Ready',
    tone: 'ok',
  })
  expect(open({ mergeable: 'CONFLICTING', mergeStateStatus: 'CLEAN' }).label).toBe(
    'Merge conflicts'
  )
  expect(
    open({ mergeStateStatus: 'CLEAN', statusCheckRollup: [{ name: 'e2e', status: 'IN_PROGRESS' }] })
      .label
  ).toBe('Checks running')
  expect(open({ mergeStateStatus: 'UNSTABLE' }).action).toBe('merge')
  expect(open({ state: 'MERGED' }).action).toBe('cleanup')
})

test('a merge never loses unpushed commits, and failing checks are said out loud', () => {
  const pr = (rollup: unknown[]) =>
    toPullRequest(JSON.stringify({ ...base, isDraft: false, statusCheckRollup: rollup }))
  const failing = pr([{ conclusion: 'FAILURE', name: 'build' }])
  const green = pr([{ conclusion: 'SUCCESS', name: 'build' }])
  expect(mergeGate(failing, 2)).toEqual({ blocked: 'Push first', failing: true })
  expect(mergeGate(green, 0)).toEqual({ blocked: null, failing: false })
  expect(mergeGate(failing, 0)).toEqual({ blocked: null, failing: true })
})

test('each headline has its icon: alerts for what stops a merge, a spinner while undecided', () => {
  const icon = (extra: object) =>
    prHeadline(toPullRequest(JSON.stringify({ ...base, isDraft: false, ...extra }))).icon
  expect(icon({ mergeStateStatus: 'CLEAN' })).toBe('ready')
  expect(icon({ mergeStateStatus: 'UNSTABLE' })).toBe('alert')
  expect(icon({ mergeStateStatus: 'BLOCKED' })).toBe('alert')
  expect(icon({ mergeStateStatus: 'BEHIND' })).toBe('alert')
  expect(icon({ mergeable: 'CONFLICTING' })).toBe('alert')
  expect(icon({ statusCheckRollup: [{ name: 'e2e', status: 'IN_PROGRESS' }] })).toBe('spinner')
  expect(icon({ mergeStateStatus: 'UNKNOWN' })).toBe('spinner')
  expect(icon({ isDraft: true })).toBe('draft')
  expect(icon({ state: 'MERGED' })).toBe('merged')
  expect(icon({ state: 'CLOSED' })).toBe('closed')
})

test('checks sort failed, running, passed, skipped; by name inside each', () => {
  const pr = toPullRequest(
    JSON.stringify({
      ...base,
      statusCheckRollup: [
        { conclusion: 'SUCCESS', name: 'lint' },
        { conclusion: 'SKIPPED', name: 'deploy' },
        { conclusion: 'FAILURE', name: 'unit' },
        { name: 'e2e', status: 'IN_PROGRESS' },
        { conclusion: 'SUCCESS', name: 'build' },
        { conclusion: 'TIMED_OUT', name: 'bench' },
      ],
    })
  )
  expect(pr.checks.map((c) => `${c.state}:${c.name}`)).toEqual([
    'failing:bench',
    'failing:unit',
    'pending:e2e',
    'passing:build',
    'passing:lint',
    'skipped:deploy',
  ])
})

test('each headline has a one-word label for a narrow panel', () => {
  const short = (extra: object) =>
    prHeadline(toPullRequest(JSON.stringify({ ...base, isDraft: false, ...extra }))).short
  expect(short({ mergeStateStatus: 'UNSTABLE' })).toBe('Failing')
  expect(short({ mergeStateStatus: 'CLEAN' })).toBe('Ready')
  expect(short({ mergeable: 'CONFLICTING' })).toBe('Conflicts')
  expect(short({ mergeStateStatus: 'BEHIND' })).toBe('Behind')
  expect(short({ statusCheckRollup: [{ name: 'e2e', status: 'IN_PROGRESS' }] })).toBe('Running')
  expect(short({ isDraft: true })).toBe('Draft')
  expect(short({ state: 'MERGED' })).toBe('Merged')
  expect(short({ state: 'CLOSED' })).toBe('Closed')
})

test('a confirm says only its warnings; its button says the action', () => {
  const merge = { action: 'merge', base: 'main', failing: true, number: 128 } as const
  expect(confirmWords(merge, 'working')).toEqual({
    long: 'Checks failing · Claude is working',
    short: 'Failing · Claude working',
    title: 'Merge #128 into main? Checks are failing. Claude is working.',
    warn: true,
  })
  expect(confirmWords({ ...merge, failing: false }, 'waiting').long).toBe('Claude is waiting')
  // Nothing to warn about: the merge says where it goes, quietly.
  expect(confirmWords({ ...merge, failing: false }, null)).toEqual({
    long: '#128 into main',
    short: 'Into main',
    title: 'Merge #128 into main?',
    warn: false,
  })
  expect(confirmWords({ action: 'cleanup', uncommitted: 3 }, 'waiting')).toEqual({
    long: '3 uncommitted changes · Claude is waiting',
    short: '3 uncommitted · Claude waiting',
    title:
      'Clean up this workspace? Its worktree folder is removed; the branch stays. It has 3 uncommitted changes. Claude is waiting.',
    warn: true,
  })
  expect(confirmWords({ action: 'cleanup', uncommitted: 1 }, null).long).toBe(
    '1 uncommitted change'
  )
  expect(confirmWords({ action: 'cleanup-anyway' }, null).long).toBe('Uncommitted changes')
})

test('git refusing over uncommitted changes is told apart from other failures', () => {
  expect(
    uncommittedRefusal("fatal: '/x' contains modified or untracked files, use --force to delete it")
  ).toBe(true)
  expect(uncommittedRefusal('fatal: not a working tree')).toBe(false)
})
