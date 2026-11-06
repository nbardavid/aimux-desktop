import { expect, test } from 'bun:test'

import { cn } from './utils'

test('custom theme keys merge like built-in ones', () => {
  expect(cn('shadow-popover', 'shadow-[0_0_0_1px_red]')).toBe('shadow-[0_0_0_1px_red]')
  expect(cn('h-bar', 'h-8')).toBe('h-8')
  expect(cn('text-faint text-sm', 'text-[13px]')).toBe('text-faint text-[13px]')
  expect(cn('rounded-xl', 'rounded-md')).toBe('rounded-md')
  expect(cn('shadow-popover', 'shadow-composer')).toBe('shadow-composer')
  // A size and a colour both start with `text-`: neither may drop the other.
  expect(cn('text-faint text-2xs', 'text-good-ink')).toBe('text-2xs text-good-ink')
  expect(cn('text-2xs', 'text-xs')).toBe('text-xs')
})
