import type * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * A shortcut as a plain glyph, `⌘N`, `⇧⌘T`: no box, faint, sans. On the ink button, pass
 * `text-white/60`. The one boxed cap left is ⌘P's footer legend (picker.tsx, `KbdBox`).
 */
function Kbd({ className, ...props }: React.ComponentProps<'kbd'>) {
  return (
    <kbd
      className={cn(
        'text-faint inline-flex h-auto items-center px-0 font-sans text-xs tracking-[0.02em] select-none',
        className
      )}
      data-slot="kbd"
      {...props}
    />
  )
}

export { Kbd }
