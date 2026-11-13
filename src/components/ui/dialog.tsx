import type * as React from 'react'

import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'

import { cn } from '@/lib/utils'

/**
 * The app's dialogs (the ⌘N composer, Settings), also ⌘P's box: a light ink veil (8 %), a
 * white sheet in the upper third with a hairline and a long soft shadow, rising 6px in 180ms
 * and fading out in 110ms. No close button: Esc and a click outside close it. ⌘P drops the
 * veil with `overlayClassName="bg-transparent"`.
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
          'bg-foreground/8 data-open:animate-in data-open:fade-in-0 data-open:duration-180 data-closed:animate-out data-closed:fade-out-0 data-closed:duration-110 fixed inset-0 z-50',
          overlayClassName
        )}
        data-slot="dialog-overlay"
      />
      <DialogPrimitive.Popup
        className={cn(
          'bg-popover text-popover-foreground border-border shadow-dialog data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-bottom-[6px] data-open:duration-180 data-open:ease-out data-closed:animate-out data-closed:fade-out-0 data-closed:duration-110 data-closed:ease-in fixed top-[16vh] left-1/2 z-50 flex w-[min(520px,calc(100%-32px))] -translate-x-1/2 flex-col overflow-hidden rounded-xl border text-sm outline-none',
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
      className={cn('flex flex-col gap-1 px-4 pt-4', className)}
      data-slot="dialog-header"
      {...props}
    />
  )
}

function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex items-center justify-end gap-2 px-4 pb-4', className)}
      data-slot="dialog-footer"
      {...props}
    />
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      className={cn('text-base font-semibold', className)}
      data-slot="dialog-title"
      {...props}
    />
  )
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      className={cn('text-muted-foreground text-xs', className)}
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
