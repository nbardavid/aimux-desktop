import { type KeyboardEvent, useEffect, useRef, useState } from 'react'

import { Icon } from './icons'

export interface PickerItem {
  key: string
  label: string
  sub?: string
  meta?: string
  glyph?: string
}

interface Props {
  title: string
  items: PickerItem[]
  filterable: boolean
  onPick: (key: string) => void
  onClose: () => void
}

function stepOf(e: KeyboardEvent): number {
  if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) return 1
  if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) return -1
  return 0
}

/** The TUI's picker modal: filter, arrows, Enter, Esc. */
export function Picker({ filterable, items, onClose, onPick, title }: Props) {
  const [query, setQuery] = useState('')
  const [hot, setHot] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const q = query.trim().toLowerCase()
  const shown = items.filter((item) => `${item.label} ${item.sub ?? ''}`.toLowerCase().includes(q))

  useEffect(() => root.current?.querySelector<HTMLElement>('input, .pick')?.focus(), [])
  useEffect(() => setHot(0), [q])

  const onKeyDown = (e: KeyboardEvent) => {
    const step = stepOf(e)
    if (step !== 0) {
      e.preventDefault()
      setHot((i) => (i + step + shown.length) % Math.max(shown.length, 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = shown[hot]
      if (item) onPick(item.key)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <div className="scrim" onMouseDown={onClose}>
      <div
        ref={root}
        className="dialog"
        role="dialog"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="dialog-head">{title}</div>
        {filterable && (
          <label className="picker-input">
            <Icon name="search" small />
            <input
              aria-label={`Filter ${title.toLowerCase()}`}
              placeholder="Filter"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        )}
        <div className="picker-list" role="listbox">
          {shown.map((item, i) => (
            <button
              type="button"
              key={item.key}
              role="option"
              aria-selected={i === hot}
              className={i === hot ? 'pick is-hot' : 'pick'}
              onMouseEnter={() => setHot(i)}
              onClick={() => onPick(item.key)}
            >
              {item.glyph !== undefined ? (
                <span className="glyph">{item.glyph}</span>
              ) : (
                <span className="idx">{i + 1}</span>
              )}
              <span className="grow">
                <span className="label">{item.label}</span>
                {item.sub !== undefined && <span className="sub">{item.sub}</span>}
              </span>
              {item.meta !== undefined && <span className="meta">{item.meta}</span>}
            </button>
          ))}
          {shown.length === 0 && <div className="quiet">Nothing matches “{query}”</div>}
        </div>
        <div className="dialog-foot">
          <span>
            <span className="kbd">↵</span>open
          </span>
          <span>
            <span className="kbd">↑↓</span>move
          </span>
          <span>
            <span className="kbd">esc</span>cancel
          </span>
        </div>
      </div>
    </div>
  )
}
