/**
 * The classes shared by the two menus: a dropdown (anchored to a trigger) and a context
 * menu (anchored to a right-click) are the same object reached by two gestures, so their
 * look lives here once. The look is today's `.ctx`: a white sheet with a hairline ring and
 * a soft shadow, 30px rows that turn grey when highlighted.
 */

/** The popup. Sized by its content; a dropdown adds its own width rule. */
export const menuPopupClass =
  'bg-popover text-popover-foreground shadow-popover z-50 flex max-h-(--available-height) min-w-[200px] origin-(--transform-origin) flex-col overflow-x-hidden overflow-y-auto rounded-xl p-1 text-sm outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-[0.98] data-closed:animate-out data-closed:fade-out-0 data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1 duration-120'

/** One row. `data-variant="destructive"` reads red. */
export const menuItemClass =
  "group/menu-item data-highlighted:bg-accent data-highlighted:text-accent-foreground data-[variant=destructive]:text-critical data-[variant=destructive]:data-highlighted:text-critical relative flex h-[30px] shrink-0 cursor-default items-center gap-2 rounded-md px-2.5 outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-45 data-inset:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5 [&_svg:not([class*='text-'])]:text-faint"

/** A row that opens a submenu: an item that also stays grey while its popup is open. */
export const menuSubTriggerClass = `${menuItemClass} data-popup-open:bg-accent`

/** A row with a check on the right (checkbox and radio rows). */
export const menuIndicatorItemClass = `${menuItemClass} pr-8`

/** A group heading. */
export const menuGroupLabelClass =
  'text-label px-2.5 pt-2 pb-1 text-xs font-medium select-none data-inset:pl-8'

/** The hairline between two groups. */
export const menuSeparatorClass = 'bg-border mx-1.5 my-1 h-px shrink-0'

/** A shortcut at the end of a row. */
export const menuShortcutClass = 'text-faint ml-auto pl-4 font-mono text-xs tracking-normal'
