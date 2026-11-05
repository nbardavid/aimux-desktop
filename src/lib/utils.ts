import { type ClassValue, clsx } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// The theme's own keys (styles.css `@theme`), so `shadow-[…]` replaces `shadow-popover` and
// `h-bar` is a height. Colours and t-shirt sizes are recognised already.
const twMerge = extendTailwindMerge({
  extend: { theme: { shadow: ['popover', 'dialog'], spacing: ['bar'] } },
})

export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs))
