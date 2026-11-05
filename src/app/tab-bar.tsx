import { MessageCircleIcon, PlusIcon, XIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

import type { Signal } from '../model/catalog'

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
    <Input
      ref={field}
      className="bg-hover text-foreground mr-1 ml-1.5 h-auto flex-1 rounded-md border-0 px-1.5 py-[3px] font-medium shadow-[inset_0_0_0_1px_var(--line-strong)] focus-visible:ring-0"
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
    <div
      className="flex min-w-0 flex-1 items-stretch overflow-x-auto [&::-webkit-scrollbar]:hidden"
      role="tablist"
      aria-label="Tabs"
    >
      {items.map((item) => {
        const active = item.id === activeId
        return (
          <div
            key={item.id}
            className={cn(
              "group text-faint hover:text-foreground relative flex min-w-[88px] flex-[0_1_168px] items-center transition-[color] duration-120 after:absolute after:right-2 after:bottom-0 after:left-2 after:h-0.5 after:scale-x-0 after:rounded-t-[2px] after:bg-tan after:transition-[scale] after:duration-220 after:ease-[cubic-bezier(0.2,0,0,1)] after:content-['']",
              active && 'text-foreground after:scale-x-100'
            )}
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
                className="flex h-full min-w-0 flex-1 items-center gap-[7px] pr-1 pl-2.5 font-medium"
                onClick={() => props.onSelect(item)}
                onDoubleClick={() => props.onRename(item)}
              >
                {/* `p-px`: Lucide's bubble fills more of its box than the old glyph did. */}
                {item.chat && <MessageCircleIcon className="text-label size-3.5 shrink-0 p-px" />}
                <span className={cn('truncate', item.id === armedId && 'text-critical')}>
                  {item.id === armedId ? 'Close? ⌘W again' : item.title}
                </span>
                {item.signal && <StatusDot signal={item.signal} />}
              </button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="mr-1 size-5 rounded-[5px] opacity-0 group-hover:opacity-100"
              aria-label={`Close ${item.title}`}
              onClick={() => props.onClose(item)}
            >
              <XIcon className="size-3.5" />
            </Button>
          </div>
        )
      })}
      <Button
        variant="ghost"
        className="h-auto w-9 rounded-none px-0 hover:bg-transparent"
        aria-label="New tab"
        aria-haspopup="menu"
        onClick={(e) => {
          const box = e.currentTarget.getBoundingClientRect()
          props.onNew({ left: box.left, top: box.bottom + 4 })
        }}
      >
        <PlusIcon className="size-4" />
      </Button>
    </div>
  )
}
