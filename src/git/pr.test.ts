import { expect, test } from 'bun:test'

import { prHeadline, toPullRequest } from './pr'

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
        { conclusion: 'SUCCESS', name: 'check', status: 'COMPLETED' },
        { conclusion: '', name: 'e2e', status: 'IN_PROGRESS' },
        { context: 'ci/legacy', state: 'FAILURE' },
      ],
    })
  )
  expect(pr.state).toBe('Draft')
  expect(pr.checks).toEqual([
    { name: 'check', state: 'passing' },
    { name: 'e2e', state: 'pending' },
    { name: 'ci/legacy', state: 'failing' },
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
    label: 'Ready to merge',
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
