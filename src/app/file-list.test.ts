import { expect, test } from 'bun:test'

import type { FileChange } from './use-git'

import { listOrder, squareOf } from './file-list'

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

test('untracked files fold into Changes, after the tracked ones', () => {
  const order = listOrder([
    f('new.md', { status: 'A', unstaged: false, untracked: true }),
    f('changed.ts', {}),
    f('gone.ts', { status: 'D' }),
  ])
  expect(order.map((x) => x.path)).toEqual(['changed.ts', 'gone.ts', 'new.md'])
})

test('the square says what happened: untracked reads as added, a copy as a rename', () => {
  expect(squareOf(f('a', { status: 'A', untracked: true }))).toBe('added')
  expect(squareOf(f('a', { status: 'A' }))).toBe('added')
  expect(squareOf(f('a', { status: 'D' }))).toBe('deleted')
  expect(squareOf(f('a', { status: 'R' }))).toBe('renamed')
  expect(squareOf(f('a', { status: 'C' }))).toBe('renamed')
  expect(squareOf(f('a', { status: 'M' }))).toBe('modified')
  expect(squareOf(f('a', { status: 'T' }))).toBe('modified')
})
