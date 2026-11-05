import type * as React from 'react'

import { Combobox as ComboboxPrimitive } from '@base-ui/react/combobox'
import { CheckIcon, ChevronDownIcon, SearchIcon, XIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

import { fieldClass } from './input'

/**
 * A searchable list, as `.combo-pop` draws the composer's pickers today: a white sheet,
 * its search on top behind a hairline (`ComboboxSearch`), 32px rows that turn grey when
 * highlighted, a check on the chosen one. `ComboboxInput` is the other shape: a field that
 * is its own trigger.
 */
const Combobox = ComboboxPrimitive.Root

/** Why the combobox reported a change (`'input-change'`, `'item-press'`, …). */
type ComboboxChangeReason = ComboboxPrimitive.Root.ChangeEventReason

function ComboboxValue({ ...props }: ComboboxPrimitive.Value.Props) {
  return <ComboboxPrimitive.Value data-slot="combobox-value" {...props} />
}

function ComboboxTrigger({ children, className, ...props }: ComboboxPrimitive.Trigger.Props) {
  return (
    <ComboboxPrimitive.Trigger
      className={cn(
        'hover:bg-foreground/6 data-popup-open:bg-foreground/6 inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg pr-2 pl-2.5 text-sm font-medium transition-colors duration-120',
        className
      )}
      data-slot="combobox-trigger"
      {...props}
    >
      {children}
      <ChevronDownIcon className="text-label size-3.5" />
    </ComboboxPrimitive.Trigger>
  )
}

/** A field that opens the list as you type. */
function ComboboxInput({ className, ...props }: ComboboxPrimitive.Input.Props) {
  return (
    <ComboboxPrimitive.Input
      className={cn(fieldClass, 'h-7', className)}
      data-slot="combobox-input"
      {...props}
    />
  )
}

/** The search row at the top of the popup. */
function ComboboxSearch({ className, ...props }: ComboboxPrimitive.Input.Props) {
  return (
    <div
      className="border-border text-faint -mx-1 mb-1 flex h-[38px] shrink-0 items-center gap-2 border-b px-3"
      data-slot="combobox-search"
    >
      <SearchIcon className="size-3.5 shrink-0" />
      <ComboboxPrimitive.Input
        className={cn(
          'text-foreground min-w-0 flex-1 bg-transparent text-sm outline-none select-text',
          className
        )}
        {...props}
      />
    </div>
  )
}

/** Clears the selection; Base UI mounts it only while there is one. */
function ComboboxClear({ className, ...props }: ComboboxPrimitive.Clear.Props) {
  return (
    <ComboboxPrimitive.Clear
      className={cn('text-faint hover:text-foreground cursor-pointer', className)}
      data-slot="combobox-clear"
      {...props}
    >
      <XIcon className="size-3.5" />
    </ComboboxPrimitive.Clear>
  )
}

function ComboboxContent({
  align = 'start',
  alignOffset = 0,
  anchor,
  className,
  side = 'bottom',
  sideOffset = 6,
  ...props
}: ComboboxPrimitive.Popup.Props &
  Pick<
    ComboboxPrimitive.Positioner.Props,
    'align' | 'alignOffset' | 'anchor' | 'side' | 'sideOffset'
  >) {
  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        anchor={anchor}
        className="isolate z-50"
        collisionPadding={8}
        side={side}
        sideOffset={sideOffset}
      >
        <ComboboxPrimitive.Popup
          className={cn(
            'bg-popover text-popover-foreground shadow-popover data-open:animate-in data-open:fade-in-0 data-open:zoom-in-[0.98] data-closed:animate-out data-closed:fade-out-0 data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1 z-50 flex max-h-(--available-height) w-80 max-w-(--available-width) origin-(--transform-origin) flex-col overflow-hidden rounded-2xl px-1 pb-1 text-sm duration-120 outline-none',
            className
          )}
          data-slot="combobox-content"
          {...props}
        />
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  )
}

function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
  return (
    <ComboboxPrimitive.List
      className={cn('min-h-0 flex-1 scroll-py-1 overflow-y-auto pt-1', className)}
      data-slot="combobox-list"
      {...props}
    />
  )
}

function ComboboxEmpty({ className, ...props }: ComboboxPrimitive.Empty.Props) {
  return (
    <ComboboxPrimitive.Empty
      className={cn('text-faint px-2.5 py-4 text-center text-[12.5px] empty:hidden', className)}
      data-slot="combobox-empty"
      {...props}
    />
  )
}

function ComboboxGroup({ ...props }: ComboboxPrimitive.Group.Props) {
  return <ComboboxPrimitive.Group data-slot="combobox-group" {...props} />
}

function ComboboxLabel({ className, ...props }: ComboboxPrimitive.GroupLabel.Props) {
  return (
    <ComboboxPrimitive.GroupLabel
      className={cn('text-label px-2.5 pt-2 pb-1 text-xs font-medium select-none', className)}
      data-slot="combobox-label"
      {...props}
    />
  )
}

function ComboboxItem({ children, className, ...props }: ComboboxPrimitive.Item.Props) {
  return (
    <ComboboxPrimitive.Item
      className={cn(
        'data-highlighted:bg-accent data-highlighted:text-accent-foreground relative flex h-8 w-full cursor-default items-center gap-2 rounded-lg pr-8 pl-2.5 outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-45',
        className
      )}
      data-slot="combobox-item"
      {...props}
    >
      {children}
      <ComboboxPrimitive.ItemIndicator className="absolute right-2.5 flex">
        <CheckIcon className="size-3.5" />
      </ComboboxPrimitive.ItemIndicator>
    </ComboboxPrimitive.Item>
  )
}

/** A dim second line or hint after an item's label. */
function ComboboxHint({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      className={cn('text-faint min-w-0 flex-1 truncate text-[11.5px]', className)}
      data-slot="combobox-hint"
      {...props}
    />
  )
}

export {
  Combobox,
  type ComboboxChangeReason,
  ComboboxClear,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxHint,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxSearch,
  ComboboxTrigger,
  ComboboxValue,
}
