import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

/**
 * The app's buttons, as `.btn-*` draws them today: flat fills, a 7px corner, no shadow,
 * a press that shrinks a hair. Focus shows only from the keyboard.
 *
 * - `default`: the ink button, the one action that matters (Create, Allow, Open chat).
 * - `secondary`: the soft grey button (Deny, Run, Edit).
 * - `outline`: white with a hairline (Later).
 * - `ghost`: nothing at rest, grey under the pointer; with an `icon` size it is `.icon-btn`.
 * - `destructive`: the red fill for what cannot be undone.
 */
const buttonVariants = cva(
  "focus-visible:ring-ring/60 inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-[background-color,border-color,color,scale] duration-120 outline-none select-none focus-visible:ring-2 active:not-disabled:scale-[0.96] disabled:cursor-default disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    defaultVariants: { size: 'default', variant: 'default' },
    variants: {
      size: {
        'default': 'h-[30px] px-3',
        'icon': 'size-7',
        'icon-sm': "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3.5",
        'sm': "h-7 px-2.5 text-[12.5px] [&_svg:not([class*='size-'])]:size-3.5",
        'xs': "h-6 gap-1 rounded-md px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
      },
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-line-ink',
        destructive: 'bg-critical hover:bg-critical/88 text-white',
        ghost:
          'text-faint hover:bg-hover hover:text-foreground aria-expanded:bg-hover aria-expanded:text-foreground',
        link: 'text-foreground decoration-tan underline-offset-2 hover:underline',
        outline: 'border-border bg-background hover:border-line-strong hover:bg-hover border',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-pill',
      },
    },
  }
)

function Button({
  className,
  size = 'default',
  variant = 'default',
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      className={cn(buttonVariants({ className, size, variant }))}
      data-slot="button"
      data-variant={variant}
      {...props}
    />
  )
}

export { Button, buttonVariants }
