import type * as React from 'react'

import { Popover as PopoverPrimitive } from '@base-ui/react/popover'

import { cn } from '@/lib/utils'

/** A sheet anchored to its trigger (the quotas): white, hairline ring, soft shadow,
 * and the menus' motion (menu-styles.ts). */
function Popover({ ...props }: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverContent({
  align = 'start',
  alignOffset = 0,
  anchor,
  className,
  side = 'bottom',
  sideOffset = 6,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<
    PopoverPrimitive.Positioner.Props,
    'align' | 'alignOffset' | 'anchor' | 'side' | 'sideOffset'
  >) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        anchor={anchor}
        className="isolate z-50"
        collisionPadding={8}
        side={side}
        sideOffset={sideOffset}
      >
        <PopoverPrimitive.Popup
          className={cn(
            'bg-popover text-popover-foreground shadow-popover data-open:animate-in data-open:fade-in-0 data-open:zoom-in-[0.98] data-open:duration-150 data-open:ease-out data-closed:animate-out data-closed:fade-out-0 data-closed:duration-110 data-closed:ease-in data-[side=bottom]:slide-in-from-top-[3px] data-[side=top]:slide-in-from-bottom-[3px] z-50 flex max-h-(--available-height) w-72 max-w-(--available-width) origin-(--transform-origin) flex-col overflow-y-auto rounded-xl p-3 text-sm outline-none',
            className
          )}
          data-slot="popover-content"
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}

function PopoverTitle({ className, ...props }: PopoverPrimitive.Title.Props) {
  return (
    <PopoverPrimitive.Title
      className={cn('text-sm font-semibold', className)}
      data-slot="popover-title"
      {...props}
    />
  )
}

function PopoverDescription({ className, ...props }: PopoverPrimitive.Description.Props) {
  return (
    <PopoverPrimitive.Description
      className={cn('text-muted-foreground text-xs', className)}
      data-slot="popover-description"
      {...props}
    />
  )
}

function PopoverHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div className={cn('flex flex-col gap-0.5', className)} data-slot="popover-header" {...props} />
  )
}

export { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger }
