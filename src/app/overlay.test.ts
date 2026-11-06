import { expect, test } from 'bun:test'

import { overlayShown } from './overlay'

/** A popup whose ancestors (itself included) carry these attributes. */
const popup = (...marks: string[]) => ({
  closest: (selector: string) =>
    marks.some((m) => selector.includes(`[${m}]`)) ? ({} as Element) : null,
})
const page = (...popups: ReturnType<typeof popup>[]) => ({
  querySelectorAll: () => popups as unknown as NodeListOf<Element>,
})

test('a popup Base UI keeps mounted while closed is not an overlay', () => {
  expect(overlayShown(page())).toBe(false)
  expect(overlayShown(page(popup('hidden')))).toBe(false)
  expect(overlayShown(page(popup('data-closed')))).toBe(false)
})

test('an open dialog or menu is, even beside a closed one', () => {
  expect(overlayShown(page(popup()))).toBe(true)
  expect(overlayShown(page(popup('hidden'), popup()))).toBe(true)
})
