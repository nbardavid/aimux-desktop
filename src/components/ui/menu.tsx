import type * as React from 'react'

import { Menu as MenuPrimitive } from '@base-ui/react/menu'
import { CheckIcon, ChevronRightIcon } from 'lucide-react'

import {
  menuGroupLabelClass,
  menuIndicatorItemClass,
  menuItemClass,
  menuPopupClass,
  menuSeparatorClass,
  menuShortcutClass,
  menuSubTriggerClass,
} from '@/lib/menu-styles'
import { cn } from '@/lib/utils'

// A dropdown menu: opened by a trigger, anchored under it. shadcn's `dropdown-menu`, named
// after Base UI's part. Same parts and look as `context-menu`.

function Menu({ ...props }: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root data-slot="menu" {...props} />
}

function MenuTrigger({ ...props }: MenuPrimitive.Trigger.Props) {
  return <MenuPrimitive.Trigger data-slot="menu-trigger" {...props} />
}

function MenuContent({
  align = 'start',
  alignOffset = 0,
  className,
  side = 'bottom',
  sideOffset = 4,
  ...props
}: MenuPrimitive.Popup.Props &
  Pick<MenuPrimitive.Positioner.Props, 'align' | 'alignOffset' | 'side' | 'sideOffset'>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        className="isolate z-50 outline-none"
        collisionPadding={8}
        side={side}
        sideOffset={sideOffset}
      >
        <MenuPrimitive.Popup
          className={cn(menuPopupClass, className)}
          data-slot="menu-content"
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  )
}

function MenuGroup({ ...props }: MenuPrimitive.Group.Props) {
  return <MenuPrimitive.Group data-slot="menu-group" {...props} />
}

function MenuLabel({
  className,
  inset,
  ...props
}: MenuPrimitive.GroupLabel.Props & { inset?: boolean }) {
  return (
    <MenuPrimitive.GroupLabel
      className={cn(menuGroupLabelClass, className)}
      data-inset={inset}
      data-slot="menu-label"
      {...props}
    />
  )
}

function MenuItem({
  className,
  inset,
  variant = 'default',
  ...props
}: MenuPrimitive.Item.Props & { inset?: boolean; variant?: 'default' | 'destructive' }) {
  return (
    <MenuPrimitive.Item
      className={cn(menuItemClass, className)}
      data-inset={inset}
      data-slot="menu-item"
      data-variant={variant}
      {...props}
    />
  )
}

function MenuCheckboxItem({
  children,
  className,
  inset,
  ...props
}: MenuPrimitive.CheckboxItem.Props & { inset?: boolean }) {
  return (
    <MenuPrimitive.CheckboxItem
      className={cn(menuIndicatorItemClass, className)}
      data-inset={inset}
      data-slot="menu-checkbox-item"
      {...props}
    >
      {children}
      <MenuPrimitive.CheckboxItemIndicator className="absolute right-2.5 flex">
        <CheckIcon className="text-foreground" />
      </MenuPrimitive.CheckboxItemIndicator>
    </MenuPrimitive.CheckboxItem>
  )
}

function MenuRadioGroup({ ...props }: MenuPrimitive.RadioGroup.Props) {
  return <MenuPrimitive.RadioGroup data-slot="menu-radio-group" {...props} />
}

function MenuRadioItem({
  children,
  className,
  inset,
  ...props
}: MenuPrimitive.RadioItem.Props & { inset?: boolean }) {
  return (
    <MenuPrimitive.RadioItem
      className={cn(menuIndicatorItemClass, className)}
      data-inset={inset}
      data-slot="menu-radio-item"
      {...props}
    >
      {children}
      <MenuPrimitive.RadioItemIndicator className="absolute right-2.5 flex">
        <CheckIcon className="text-foreground" />
      </MenuPrimitive.RadioItemIndicator>
    </MenuPrimitive.RadioItem>
  )
}

function MenuSub({ ...props }: MenuPrimitive.SubmenuRoot.Props) {
  return <MenuPrimitive.SubmenuRoot data-slot="menu-sub" {...props} />
}

function MenuSubTrigger({
  children,
  className,
  inset,
  ...props
}: MenuPrimitive.SubmenuTrigger.Props & { inset?: boolean }) {
  return (
    <MenuPrimitive.SubmenuTrigger
      className={cn(menuSubTriggerClass, className)}
      data-inset={inset}
      data-slot="menu-sub-trigger"
      {...props}
    >
      {children}
      <ChevronRightIcon className="ml-auto" />
    </MenuPrimitive.SubmenuTrigger>
  )
}

function MenuSubContent({
  align = 'start',
  alignOffset = -4,
  side = 'right',
  sideOffset = 2,
  ...props
}: React.ComponentProps<typeof MenuContent>) {
  return (
    <MenuContent
      align={align}
      alignOffset={alignOffset}
      data-slot="menu-sub-content"
      side={side}
      sideOffset={sideOffset}
      {...props}
    />
  )
}

function MenuSeparator({ className, ...props }: MenuPrimitive.Separator.Props) {
  return (
    <MenuPrimitive.Separator
      className={cn(menuSeparatorClass, className)}
      data-slot="menu-separator"
      {...props}
    />
  )
}

function MenuShortcut({ className, ...props }: React.ComponentProps<'span'>) {
  return <span className={cn(menuShortcutClass, className)} data-slot="menu-shortcut" {...props} />
}

export {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuGroup,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuShortcut,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
}
