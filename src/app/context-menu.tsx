import { useEffect, useLayoutEffect, useRef, useState } from 'react'

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
  const root = useRef<HTMLDivElement>(null)
  const [asking, setAsking] = useState<MenuAction | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pos, setPos] = useState({ left: menu.x, top: menu.y })

  // Keep the menu on screen: flip it left or up when it would overflow.
  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    const { height, width } = el.getBoundingClientRect()
    setPos({
      left: Math.max(8, Math.min(menu.x, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(menu.y, window.innerHeight - height - 8)),
    })
  }, [menu, asking, error])

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', key)
    window.addEventListener('blur', onClose)
    return () => {
      window.removeEventListener('keydown', key)
      window.removeEventListener('blur', onClose)
    }
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

  return (
    <div className="scrim is-clear" onMouseDown={onClose} onContextMenu={(e) => e.preventDefault()}>
      <div
        ref={root}
        className="ctx"
        style={pos}
        role="menu"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {asking?.confirm ? (
          <div className="ctx-ask">
            <div className="ctx-text">{retry ? retry.text : asking.confirm.text}</div>
            {error !== null && !retry && <div className="ctx-error">{error}</div>}
            <div className="ctx-actions">
              <button type="button" className="btn btn-soft" onClick={onClose}>
                Cancel
              </button>
              {/* oxlint-disable-next-line jsx-a11y/no-autofocus -- the question is the only thing on screen */}
              <button
                type="button"
                className="btn btn-danger"
                autoFocus
                disabled={busy}
                onClick={() => perform(retry ? retry.run : asking.run)}
              >
                {busy ? 'Working…' : (retry?.button ?? asking.confirm.button)}
              </button>
            </div>
          </div>
        ) : (
          menu.items.map((item, i) =>
            item === 'separator' ? (
              // oxlint-disable-next-line react/no-array-index-key -- separators are positional
              <div key={`sep${i}`} className="ctx-sep" />
            ) : (
              <button
                type="button"
                key={item.label}
                role="menuitem"
                className={item.danger === true ? 'ctx-item is-danger' : 'ctx-item'}
                disabled={busy}
                onClick={() => pick(item)}
              >
                {item.label}
              </button>
            )
          )
        )}
        {!asking && error !== null && <div className="ctx-error">{error}</div>}
      </div>
    </div>
  )
}
