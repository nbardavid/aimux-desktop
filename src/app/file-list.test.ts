import { expect, test } from 'bun:test'

import type { FileChange } from './use-git'

import { listOrder } from './file-list'

const f = (path: string, o: Partial<FileChange>): FileChange => ({
  add: 1,
  del: 0,
  path,
  staged: false,
  status: 'M',
  unstaged: true,
  untracked: false,
  ...o,
})

test('arrows walk the files as the list shows them, each once', () => {
  const order = listOrder([
    f('new.md', { status: 'A', unstaged: false, untracked: true }),
    f('both.ts', { staged: true }),
    f('changed.ts', {}),
    f('staged.ts', { staged: true, unstaged: false }),
  ])
  expect(order.map((x) => x.path)).toEqual(['both.ts', 'staged.ts', 'changed.ts', 'new.md'])
})
