import { useEffect, useRef } from 'react'

import type { Signal } from '../model/catalog'

import { Icon } from './icons'
import { StatusDot } from './status-dot'

/** A terminal tab of the daemon, or a native chat of this window. */
export interface TabItem {
  id: string
  title: string
  chat: boolean
  signal: Signal | null
}

interface Props {
  items: TabItem[]
  activeId: string | undefined
  /** The tab waiting for a second close: its agent is still working. */
  armedId: string | null
  renamingId: string | null
  onSelect: (item: TabItem) => void
  onClose: (item: TabItem) => void
  onMenu: (item: TabItem, x: number, y: number) => void
  onRename: (item: TabItem) => void
  /** A new title, or null when renaming was dropped. */
  onRenamed: (item: TabItem, title: string | null) => void
  /** Opens the assistant menu under the + button. */
  onNew: (anchor: { left: number; top: number }) => void
}

function RenameField({ item, onDone }: { item: TabItem; onDone: (title: string | null) => void }) {
  const field = useRef<HTMLInputElement>(null)
  // Focus first: `/rename` starts it while the composer has the focus.
  useEffect(() => {
    field.current?.focus()
    field.current?.select()
  }, [])
  return (
    <input
      ref={field}
      className="tab-input"
      aria-label="Tab name"
      defaultValue={item.title}
      spellCheck={false}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') onDone(null)
      }}
      onBlur={(e) => onDone(e.currentTarget.value.trim() || null)}
    />
  )
}

export function TabBar(props: Props) {
  const { activeId, armedId, items, renamingId } = props
  return (
    <div className="tabbar" role="tablist" aria-label="Tabs">
      {items.map((item) => {
        const active = item.id === activeId
        const classes = ['tab', active && 'is-active', item.id === armedId && 'is-armed']
        return (
          <div
            key={item.id}
            className={classes.filter(Boolean).join(' ')}
            onContextMenu={(e) => {
              e.preventDefault()
              props.onMenu(item, e.clientX, e.clientY)
            }}
          >
            {item.id === renamingId ? (
              <RenameField item={item} onDone={(title) => props.onRenamed(item, title)} />
            ) : (
              <button
                type="button"
                role="tab"
                aria-selected={active}
                className="tab-main"
                onClick={() => props.onSelect(item)}
                onDoubleClick={() => props.onRename(item)}
              >
                {item.chat && <Icon name="chat" small />}
                <span className="tab-title">
                  {item.id === armedId ? 'Close? ⌘W again' : item.title}
                </span>
                {item.signal && <StatusDot signal={item.signal} />}
              </button>
            )}
            <button
              type="button"
              className="tab-close"
              aria-label={`Close ${item.title}`}
              onClick={() => props.onClose(item)}
            >
              <Icon name="close" small />
            </button>
          </div>
        )
      })}
      <button
        type="button"
        className="tab-add"
        aria-label="New tab"
        aria-haspopup="menu"
        onClick={(e) => {
          const box = e.currentTarget.getBoundingClientRect()
          props.onNew({ left: box.left, top: box.bottom + 4 })
        }}
      >
        <Icon name="plus" />
      </button>
    </div>
  )
}
