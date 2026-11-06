import { expect, test } from 'bun:test'

import { browserShown, covers, serial } from './use-browser'

const on = {
  covered: false,
  mode: 'normal' as const,
  panelOpen: true,
  sliding: false,
  view: { browser: 'https://claude.ai/artifact/x' },
}

test('the page shows only on screen, settled and uncovered', () => {
  expect(browserShown(on)).toBe(true)
  expect(browserShown({ ...on, mode: 'settings' })).toBe(false)
  expect(browserShown({ ...on, mode: 'git' })).toBe(false)
  expect(browserShown({ ...on, panelOpen: false })).toBe(false)
  expect(browserShown({ ...on, view: 'changes' })).toBe(false)
  expect(browserShown({ ...on, covered: true })).toBe(false)
  expect(browserShown({ ...on, sliding: true })).toBe(false)
})

const page = { bottom: 900, left: 800, right: 1400, top: 120 }

test('a floating surface covers the page only where they cross', () => {
  expect(covers([{ bottom: 300, left: 700, right: 900, top: 200 }], page)).toBe(true)
  expect(covers([{ bottom: 300, left: 100, right: 300, top: 200 }], page)).toBe(false)
  // Touching edges is not crossing; an empty (unpositioned) rect never covers.
  expect(covers([{ bottom: 120, left: 900, right: 1000, top: 100 }], page)).toBe(false)
  expect(covers([{ bottom: 0, left: 0, right: 0, top: 0 }], page)).toBe(false)
  expect(covers([], page)).toBe(false)
})

test('page commands run one after another, and a cancelled one is skipped', async () => {
  const done: string[] = []
  const run = serial()
  let open: () => void = () => {}
  const gate = new Promise<void>((resolve) => (open = resolve))
  run(async () => {
    await gate
    done.push('hide')
  })
  const { cancel } = run(async () => {
    done.push('show')
  })
  run(async () => {
    done.push('hide again')
  })
  cancel()
  open()
  await run(async () => {}).done
  expect(done).toEqual(['hide', 'hide again'])
})
