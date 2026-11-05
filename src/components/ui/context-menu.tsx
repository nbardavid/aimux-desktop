import type * as React from 'react'

import { ContextMenu as ContextMenuPrimitive } from '@base-ui/react/context-menu'
import { ChevronRightIcon } from 'lucide-react'

import {
  menuGroupLabelClass,
  menuItemClass,
  menuPopupClass,
  menuSeparatorClass,
  menuShortcutClass,
  menuSubTriggerClass,
} from '@/lib/menu-styles'
import { cn } from '@/lib/utils'

// The right-click menu: same parts and look as `menu`, opened at the pointer by a
// right-click (or a long press) on its trigger.

function ContextMenu({ ...props }: ContextMenuPrimitive.Root.Props) {
  return <ContextMenuPrimitive.Root data-slot="context-menu" {...props} />
}

function ContextMenuTrigger({ ...props }: ContextMenuPrimitive.Trigger.Props) {
  return <ContextMenuPrimitive.Trigger data-slot="context-menu-trigger" {...props} />
}

function ContextMenuContent({
  className,
  sideOffset = 2,
  ...props
}: ContextMenuPrimitive.Popup.Props & Pick<ContextMenuPrimitive.Positioner.Props, 'sideOffset'>) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Positioner
        className="isolate z-50 outline-none"
        collisionPadding={8}
        sideOffset={sideOffset}
      >
        <ContextMenuPrimitive.Popup
          className={cn(menuPopupClass, 'max-w-[300px]', className)}
          data-slot="context-menu-content"
          {...props}
        />
      </ContextMenuPrimitive.Positioner>
    </ContextMenuPrimitive.Portal>
  )
}

function ContextMenuGroup({ ...props }: ContextMenuPrimitive.Group.Props) {
  return <ContextMenuPrimitive.Group data-slot="context-menu-group" {...props} />
}

function ContextMenuLabel({ className, ...props }: ContextMenuPrimitive.GroupLabel.Props) {
  return (
    <ContextMenuPrimitive.GroupLabel
      className={cn(menuGroupLabelClass, className)}
      data-slot="context-menu-label"
      {...props}
    />
  )
}

function ContextMenuItem({
  className,
  variant = 'default',
  ...props
}: ContextMenuPrimitive.Item.Props & { variant?: 'default' | 'destructive' }) {
  return (
    <ContextMenuPrimitive.Item
      className={cn(menuItemClass, className)}
      data-slot="context-menu-item"
      data-variant={variant}
      {...props}
    />
  )
}

function ContextMenuSub({ ...props }: ContextMenuPrimitive.SubmenuRoot.Props) {
  return <ContextMenuPrimitive.SubmenuRoot data-slot="context-menu-sub" {...props} />
}

function ContextMenuSubTrigger({
  children,
  className,
  ...props
}: ContextMenuPrimitive.SubmenuTrigger.Props) {
  return (
    <ContextMenuPrimitive.SubmenuTrigger
      className={cn(menuSubTriggerClass, className)}
      data-slot="context-menu-sub-trigger"
      {...props}
    >
      {children}
      <ChevronRightIcon className="ml-auto" />
    </ContextMenuPrimitive.SubmenuTrigger>
  )
}

function ContextMenuSubContent({ className, ...props }: ContextMenuPrimitive.Popup.Props) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Positioner
        align="start"
        alignOffset={-4}
        className="isolate z-50 outline-none"
        collisionPadding={8}
        side="right"
        sideOffset={2}
      >
        <ContextMenuPrimitive.Popup
          className={cn(menuPopupClass, className)}
          data-slot="context-menu-sub-content"
          {...props}
        />
      </ContextMenuPrimitive.Positioner>
    </ContextMenuPrimitive.Portal>
  )
}

function ContextMenuSeparator({ className, ...props }: ContextMenuPrimitive.Separator.Props) {
  return (
    <ContextMenuPrimitive.Separator
      className={cn(menuSeparatorClass, className)}
      data-slot="context-menu-separator"
      {...props}
    />
  )
}

function ContextMenuShortcut({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      className={cn(menuShortcutClass, className)}
      data-slot="context-menu-shortcut"
      {...props}
    />
  )
}

export {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
}
