import type * as React from 'react'

import { Input as InputPrimitive } from '@base-ui/react/input'

import { cn } from '@/lib/utils'

/** A text field, as `.input` draws it: hairline, tan border and halo while typing. */
const fieldClass =
  'border-input bg-background text-foreground placeholder:text-faint hover:border-muted-foreground focus-visible:border-ring focus-visible:ring-ring/22 aria-invalid:border-critical w-full min-w-0 rounded-lg border px-2.5 text-sm transition-[border-color,box-shadow] duration-120 outline-none select-text focus-visible:ring-3 disabled:cursor-default disabled:opacity-45'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <InputPrimitive
      className={cn(fieldClass, 'h-7', className)}
      data-slot="input"
      type={type}
      {...props}
    />
  )
}

export { fieldClass, Input }
