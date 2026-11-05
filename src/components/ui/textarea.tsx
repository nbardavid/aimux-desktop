import type * as React from 'react'

import { cn } from '@/lib/utils'

import { fieldClass } from './input'

/** A field that grows with what is typed in it. */
function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(fieldClass, 'field-sizing-content min-h-16 resize-none py-1.5', className)}
      data-slot="textarea"
      {...props}
    />
  )
}

export { Textarea }
