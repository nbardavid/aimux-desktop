import { MessageCircleIcon, PlusIcon, SquareTerminalIcon, XIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
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

/**
 * A tab's button: its icon, its title (cut only when the bar is full, then shown whole on
 * hover), and its status. The tooltip is a popup: the bar scrolls, and would clip a `data-tip`.
 */
function TabButton({
  active,
  armed,
  item,
  onRename,
  onSelect,
}: {
  item: TabItem
  active: boolean
  armed: boolean
  onSelect: () => void
  onRename: () => void
}) {
  const title = useRef<HTMLSpanElement>(null)
  const [cut, setCut] = useState(false)
  // Whether the title is cut, kept as the tab resizes: the tooltip shows only then.
  useEffect(() => {
    const el = title.current
    if (!el) return
    const measure = () => setCut(el.scrollWidth > el.clientWidth)
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [item.title])
  const Icon = item.chat ? MessageCircleIcon : SquareTerminalIcon
  return (
    <Tooltip disabled={!cut || armed}>
      <TooltipTrigger
        render={
          <button
            type="button"
            role="tab"
            aria-selected={active}
            className="flex h-full max-w-[240px] min-w-0 flex-1 items-center gap-[7px] px-2.5 font-medium"
            onClick={onSelect}
            onDoubleClick={onRename}
          />
        }
      >
        {/* `p-px`: Lucide's glyphs fill more of their box than the old ones did. */}
        <Icon className="text-label size-3.5 shrink-0 p-px" />
        <span ref={title} className={cn('truncate', armed && 'text-critical')}>
          {armed ? 'Close? ⌘W again' : item.title}
        </span>
        {item.signal && <StatusDot signal={item.signal} />}
      </TooltipTrigger>
      <TooltipContent>{item.title}</TooltipContent>
    </Tooltip>
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
        const armed = item.id === armedId
        return (
          // As wide as the title, up to 240px. Once the bar is full, short tabs keep their width
          // and the long ones share what is left (down to 72px): space is handed out evenly, each
          // tab stopping at its own width.
          <div
            key={item.id}
            className={cn(
              "group text-faint hover:text-foreground relative flex max-w-max min-w-[72px] flex-[1_1_0%] items-center transition-[color] duration-120 after:absolute after:right-2 after:bottom-0 after:left-2 after:h-0.5 after:scale-x-0 after:rounded-t-[2px] after:bg-tan after:transition-[scale] after:duration-220 after:ease-[cubic-bezier(0.2,0,0,1)] after:content-['']",
              active && 'text-foreground after:scale-x-100',
              armed && 'min-w-max'
            )}
            onContextMenu={(e) => {
              e.preventDefault()
              props.onMenu(item, e.clientX, e.clientY)
            }}
          >
            {item.id === renamingId ? (
              <RenameField item={item} onDone={(title) => props.onRenamed(item, title)} />
            ) : (
              <TabButton
                item={item}
                active={active}
                armed={armed}
                onSelect={() => props.onSelect(item)}
                onRename={() => props.onRename(item)}
              />
            )}
            {/* Over the title's end on hover, on a fade, rather than a slot kept empty. */}
            <span className="from-background/0 to-background pointer-events-none absolute inset-y-0 right-0 flex items-center bg-linear-to-r to-40% pr-1 pl-5 opacity-0 transition-opacity duration-120 group-focus-within:opacity-100 group-hover:opacity-100">
              <Button
                variant="ghost"
                size="icon"
                className="pointer-events-auto size-5 rounded-[5px]"
                aria-label={`Close ${item.title}`}
                onClick={() => props.onClose(item)}
              >
                <XIcon className="size-3.5" />
              </Button>
            </span>
          </div>
        )
      })}
      <Button
        variant="ghost"
        className="h-auto w-9 flex-none rounded-none px-0 hover:bg-transparent"
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
