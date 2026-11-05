import { expect, test } from 'bun:test'

import { toPullRequest } from './pr'

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
