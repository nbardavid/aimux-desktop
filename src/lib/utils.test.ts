import { expect, test } from 'bun:test'

import { cn } from './utils'

test('custom theme keys merge like built-in ones', () => {
  expect(cn('shadow-popover', 'shadow-[0_0_0_1px_red]')).toBe('shadow-[0_0_0_1px_red]')
  expect(cn('h-bar', 'h-8')).toBe('h-8')
  expect(cn('text-faint text-sm', 'text-[13px]')).toBe('text-faint text-[13px]')
  expect(cn('rounded-xl', 'rounded-2xl')).toBe('rounded-2xl')
})
