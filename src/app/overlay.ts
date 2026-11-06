/**
 * Something sits over the page (a palette, a menu, a popover): Esc and the chat's keys are
 * its. Base UI keeps a closed popup mounted (`hidden`, `data-closed`): that one does not count.
 */
export const overlayShown = (root: Pick<ParentNode, 'querySelectorAll'> = document) =>
  [...root.querySelectorAll('[role=dialog], [role=menu]')].some(
    (el) => el.closest('[hidden], [data-closed]') === null
  )
