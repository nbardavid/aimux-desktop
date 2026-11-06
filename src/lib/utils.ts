import { type ClassValue, clsx } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// The theme's own keys (styles.css `@theme`), so `shadow-[…]` replaces `shadow-popover`,
// `h-bar` is a height and `text-2xs` a size (not a colour). Colours and the other t-shirt
// sizes are recognised already.
const twMerge = extendTailwindMerge({
  extend: { theme: { shadow: ['popover', 'dialog', 'composer'], spacing: ['bar'], text: ['2xs'] } },
})

export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs))
