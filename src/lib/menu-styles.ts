/**
 * The classes shared by the two menus: a dropdown (anchored to a trigger) and a context
 * menu (anchored to a right-click) are the same object reached by two gestures, so their
 * look lives here once: a white sheet with a hairline ring and a soft shadow, 28px rows that
 * turn grey when highlighted, shortcuts as plain glyphs. Popovers that list things (the
 * inbox, ⌘N's project menu) use the same popup.
 */

/** The popup. Sized by its content; a dropdown adds its own width rule. Enters in 150ms with
 * a fade, a 3px slide from its anchor and a 0.98 scale; leaves in 110ms with a fade. */
export const menuPopupClass =
  'bg-popover text-popover-foreground shadow-popover z-50 flex max-h-(--available-height) min-w-[200px] origin-(--transform-origin) flex-col overflow-x-hidden overflow-y-auto rounded-xl p-1 text-sm outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-[0.98] data-open:duration-150 data-open:ease-out data-closed:animate-out data-closed:fade-out-0 data-closed:duration-110 data-closed:ease-in data-[side=bottom]:slide-in-from-top-[3px] data-[side=top]:slide-in-from-bottom-[3px] data-[side=left]:slide-in-from-right-[3px] data-[side=right]:slide-in-from-left-[3px]'

/** One 28px row. Icons are 14px faint, ink when highlighted. `data-variant="destructive"`
 * reads red. */
export const menuItemClass =
  "group/menu-item data-highlighted:bg-accent data-highlighted:text-accent-foreground data-[variant=destructive]:text-critical-ink data-[variant=destructive]:data-highlighted:text-critical-ink relative flex h-7 shrink-0 cursor-default items-center gap-2 rounded-md px-2 outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-45 data-inset:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:transition-colors [&_svg]:duration-120 [&_svg:not([class*='size-'])]:size-3.5 [&_svg:not([class*='text-'])]:text-faint data-highlighted:[&_svg:not([class*='text-'])]:text-foreground"

/** A row that opens a submenu: an item that also stays grey while its popup is open. */
export const menuSubTriggerClass = `${menuItemClass} data-popup-open:bg-accent`

/** A row with a check on the right (checkbox and radio rows). */
export const menuIndicatorItemClass = `${menuItemClass} pr-8`

/** A group heading. */
export const menuGroupLabelClass =
  'text-label flex h-6 items-center px-2 text-xs font-medium select-none data-inset:pl-8'

/** The hairline between two groups, edge to edge. */
export const menuSeparatorClass = 'bg-border -mx-1 my-1 h-px shrink-0'

/** A shortcut at the end of a row: a plain glyph, as `Kbd` draws it. */
export const menuShortcutClass = 'text-faint ml-auto pl-4 text-xs tracking-[0.02em]'
