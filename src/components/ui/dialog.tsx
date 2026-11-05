import type * as React from 'react'

import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'

import { cn } from '@/lib/utils'

/**
 * The one dialog the app has (the ⌘N composer), as `.scrim` + `.dialog` draw it: a faint
 * ink veil, a white sheet in the upper third with a hairline and a long soft shadow. No
 * close button: Esc and a click outside close it.
 */
function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogContent({
  className,
  overlayClassName,
  ...props
}: DialogPrimitive.Popup.Props & { overlayClassName?: string }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop
        className={cn(
          'bg-foreground/6 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 fixed inset-0 z-50 duration-120',
          overlayClassName
        )}
        data-slot="dialog-overlay"
      />
      <DialogPrimitive.Popup
        className={cn(
          'bg-popover text-popover-foreground border-border shadow-dialog data-open:animate-in data-open:fade-in-0 data-open:zoom-in-[0.99] data-open:slide-in-from-bottom-1.5 data-closed:animate-out data-closed:fade-out-0 fixed top-[16vh] left-1/2 z-50 flex w-[min(520px,calc(100%-32px))] -translate-x-1/2 flex-col overflow-hidden rounded-2xl border text-sm duration-160 outline-none',
          className
        )}
        data-slot="dialog-content"
        {...props}
      />
    </DialogPrimitive.Portal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex flex-col gap-1 px-[18px] pt-4', className)}
      data-slot="dialog-header"
      {...props}
    />
  )
}

function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex items-center justify-end gap-2 px-[18px] pb-4', className)}
      data-slot="dialog-footer"
      {...props}
    />
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      className={cn('text-sm font-semibold', className)}
      data-slot="dialog-title"
      {...props}
    />
  )
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      className={cn('text-muted-foreground text-[12.5px]', className)}
      data-slot="dialog-description"
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
}
