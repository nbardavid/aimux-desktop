import type * as React from 'react'

import { cn } from '@/lib/utils'

/** A key cap, as `.kbd` draws it: `⌘N`, `⇧⌘T`. */
function Kbd({ className, ...props }: React.ComponentProps<'kbd'>) {
  return (
    <kbd
      className={cn(
        'border-border bg-background text-faint inline-flex h-4 items-center rounded-sm border px-[5px] font-mono text-[10px] leading-4 select-none',
        className
      )}
      data-slot="kbd"
      {...props}
    />
  )
}

export { Kbd }
