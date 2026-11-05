import { Menu } from '@base-ui/react/menu'
import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { menuItemClass, menuPopupClass, menuSeparatorClass } from '@/lib/menu-styles'
import { cn } from '@/lib/utils'

export interface MenuAction {
  label: string
  run: () => void | Promise<void>
  danger?: boolean
  /** Asked in place before running: what will happen, and the button that does it. */
  confirm?: { text: string; button: string }
  /** Offered when `run` fails, e.g. deleting anyway what has uncommitted changes. */
  retry?: {
    when: (error: string) => boolean
    text: string
    button: string
    run: () => Promise<void>
  }
}

export type MenuItem = MenuAction | 'separator'

export interface MenuState {
  x: number
  y: number
  items: MenuItem[]
}

/** A right-click menu at the pointer; a destructive item asks for confirmation in the menu itself. */
export function ContextMenu({ menu, onClose }: { menu: MenuState; onClose: () => void }) {
  const [asking, setAsking] = useState<MenuAction | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The pointer, as a zero-size box for the menu to hang from. It shifts to stay on screen.
  const point = useMemo(
    () => ({ getBoundingClientRect: () => DOMRect.fromRect({ x: menu.x, y: menu.y }) }),
    [menu.x, menu.y]
  )

  useEffect(() => {
    window.addEventListener('blur', onClose)
    return () => window.removeEventListener('blur', onClose)
  }, [onClose])

  const perform = (run: () => void | Promise<void>) => {
    setBusy(true)
    setError(null)
    Promise.resolve()
      .then(run)
      .then(onClose, (error_: unknown) => {
        setBusy(false)
        setError(String(error_).replace(/^Error: /, ''))
      })
  }

  const pick = (item: MenuAction) => {
    if (item.confirm && asking !== item) setAsking(item)
    else perform(item.run)
  }

  const retry = asking?.retry && error !== null && asking.retry.when(error) ? asking.retry : null
  const errorLine = (
    <div className="text-critical px-2 pt-1 pb-1.5 text-[12px] leading-[1.4] wrap-anywhere">
      {error}
    </div>
  )

  return (
    <Menu.Root open onOpenChange={(open) => !open && onClose()}>
      <Menu.Portal>
        <Menu.Positioner
          anchor={point}
          side="bottom"
          align="start"
          collisionAvoidance={{ align: 'shift', side: 'shift' }}
          collisionPadding={8}
          className="isolate z-50 outline-none"
        >
          <Menu.Popup className={cn(menuPopupClass, 'max-w-[300px]')}>
            {asking?.confirm ? (
              <div className="flex flex-col gap-2.5 px-2 pt-2 pb-1.5">
                <div>{retry ? retry.text : asking.confirm.text}</div>
                {error !== null && !retry && errorLine}
                <div className="flex justify-end gap-1.5">
                  <Button variant="secondary" className={ASK_BUTTON} onClick={onClose}>
                    Cancel
                  </Button>
                  {/* oxlint-disable-next-line jsx-a11y/no-autofocus -- the question is the only thing on screen */}
                  <Button
                    variant="destructive"
                    className={cn(ASK_BUTTON, DANGER_HOVER)}
                    autoFocus
                    disabled={busy}
                    onClick={() => perform(retry ? retry.run : asking.run)}
                  >
                    {busy ? 'Working…' : (retry?.button ?? asking.confirm.button)}
                  </Button>
                </div>
              </div>
            ) : (
              menu.items.map((item, i) =>
                item === 'separator' ? (
                  // oxlint-disable-next-line react/no-array-index-key -- separators are positional
                  <Menu.Separator key={`sep${i}`} className={menuSeparatorClass} />
                ) : (
                  <Menu.Item
                    key={item.label}
                    className={cn(menuItemClass, 'data-disabled:opacity-100')}
                    data-variant={item.danger === true ? 'destructive' : 'default'}
                    disabled={busy}
                    closeOnClick={false}
                    onClick={() => pick(item)}
                  >
                    {item.label}
                  </Menu.Item>
                )
              )
            )}
            {!asking && error !== null && errorLine}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}

// `.ctx-actions .btn`: a notch smaller than the default button.
const ASK_BUTTON = 'h-7 text-[12.5px]'
// `.btn-danger:hover` darkens the red rather than fading it.
const DANGER_HOVER = 'hover:bg-[color-mix(in_srgb,var(--critical)_88%,black)]'
