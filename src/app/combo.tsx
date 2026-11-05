import { type ReactNode, useEffect, useRef, useState } from 'react'

import { Icon } from './icons'

export interface ComboOption {
  value: string
  label: string
  hint?: string
  /** A heading shown above the first option of each run; dropped while searching. */
  section?: string
}

interface Props {
  button: ReactNode
  options: ComboOption[]
  selected: string
  placeholder: string
  onPick: (value: string) => void
  footer?: ReactNode
  className?: string
}

const GAP = 6
const MARGIN = 12

/** A button that opens a searchable list, above or below it, wherever the window has room. */
export function Combo({
  button,
  className,
  footer,
  onPick,
  options,
  placeholder,
  selected,
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [hot, setHot] = useState(0)
  const [room, setRoom] = useState({ height: 360, up: true })
  const root = useRef<HTMLDivElement>(null)
  const q = query.trim().toLowerCase()
  const seen = new Set<string>()
  const shown = options.filter((o) => {
    if (q === '') return true
    if (seen.has(o.value) || !`${o.label} ${o.value}`.toLowerCase().includes(q)) return false
    seen.add(o.value)
    return true
  })

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (root.current?.contains(e.target as Node) !== true) setOpen(false)
    }
    window.addEventListener('mousedown', away)
    return () => window.removeEventListener('mousedown', away)
  }, [open])

  useEffect(() => setHot(0), [q])

  const toggle = () => {
    const box = root.current?.getBoundingClientRect()
    if (box && !open) {
      const above = box.top - GAP - MARGIN
      const below = window.innerHeight - box.bottom - GAP - MARGIN
      setRoom({ height: Math.min(420, Math.max(above, below)), up: above >= below })
    }
    setOpen((o) => !o)
  }

  const pick = (value: string) => {
    onPick(value)
    setOpen(false)
    setQuery('')
  }

  return (
    <div
      className={className === undefined ? 'combo' : `combo ${className}`}
      ref={root}
      onKeyDown={(e) => {
        if (!open) return
        if (e.key === 'Escape') {
          e.stopPropagation()
          setOpen(false)
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault()
          const step = e.key === 'ArrowDown' ? 1 : -1
          setHot((i) => (i + step + shown.length) % Math.max(shown.length, 1))
        } else if (e.key === 'Enter') {
          e.preventDefault()
          e.stopPropagation()
          const option = shown[hot]
          if (option) pick(option.value)
        }
      }}
    >
      <button type="button" className="combo-btn" aria-expanded={open} onClick={toggle}>
        {button}
        <span className={open ? 'chev is-up' : 'chev'}>
          <Icon name="chevron" small />
        </span>
      </button>
      {open && (
        <div
          className={room.up ? 'combo-pop is-up' : 'combo-pop is-down'}
          style={{ maxHeight: room.height }}
          role="dialog"
          aria-label={placeholder}
        >
          <label className="combo-search">
            <Icon name="search" small />
            {/* oxlint-disable-next-line jsx-a11y/no-autofocus -- the list opens to be searched */}
            <input
              autoFocus
              aria-label={placeholder}
              placeholder={placeholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="combo-list" role="listbox">
            {shown.map((o, i) => (
              <div key={`${o.section ?? ''}:${o.value}`} className="combo-item">
                {q === '' && o.section !== undefined && o.section !== shown[i - 1]?.section && (
                  <div className="combo-section">{o.section}</div>
                )}
                <button
                  type="button"
                  role="option"
                  aria-selected={o.value === selected}
                  className={i === hot ? 'combo-option is-hot' : 'combo-option'}
                  onMouseEnter={() => setHot(i)}
                  onClick={() => pick(o.value)}
                >
                  <span className="combo-label">{o.label}</span>
                  {o.hint !== undefined && <span className="combo-hint">{o.hint}</span>}
                  {o.value === selected && <span className="combo-tick">✓</span>}
                </button>
              </div>
            ))}
            {shown.length === 0 && <div className="quiet">Nothing matches “{query}”</div>}
          </div>
          {footer}
        </div>
      )}
    </div>
  )
}
