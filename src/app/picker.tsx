import { SearchIcon } from 'lucide-react'
import { type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'

import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Kbd } from '@/components/ui/kbd'
import { Popover, PopoverContent } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

import { pointerMoved } from './pointer'

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
  /** Drops down from this point (a button's corner), or rises above it (`bottom`), instead of
   * opening as a palette. */
  anchor?: { left: number; top: number } | { left: number; bottom: number }
  /** What the filter starts with. */
  initialQuery?: string
  /** Said when there are no items at all (rather than none matching). */
  empty?: string
}

function stepOf(e: KeyboardEvent): number {
  if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) return 1
  if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) return -1
  return 0
}

/** The TUI's picker: filter, arrows, Enter, Esc. A palette, or a menu at a point. */
export function Picker({
  anchor,
  empty,
  filterable,
  initialQuery = '',
  items,
  onClose,
  onPick,
  title,
}: Props) {
  const [query, setQuery] = useState(initialQuery)
  const [hot, setHot] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const q = query.trim().toLowerCase()
  const shown = items.filter((item) => `${item.label} ${item.sub ?? ''}`.toLowerCase().includes(q))
  const menu = anchor !== undefined
  // A point for the popover to hang from (or rise above).
  const point = useMemo(() => {
    if (!anchor) return null
    const y = 'top' in anchor ? anchor.top : window.innerHeight - anchor.bottom
    return { getBoundingClientRect: () => DOMRect.fromRect({ x: anchor.left, y }) }
  }, [anchor])

  useEffect(() => setHot(0), [q])
  useEffect(() => {
    root.current
      ?.querySelector('[role=option][aria-selected=true]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [hot, q])

  const onKeyDown = (e: KeyboardEvent) => {
    const step = stepOf(e)
    if (step !== 0) {
      e.preventDefault()
      setHot((i) => (i + step + shown.length) % Math.max(shown.length, 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = shown[hot]
      if (item) onPick(item.key)
    }
  }

  const firstFocus = () => root.current?.querySelector<HTMLElement>('input, [role=option]') ?? true

  const body = (
    <div ref={root} className="contents" onKeyDown={onKeyDown}>
      {!menu && !filterable && (
        <div className="px-[18px] pt-4 text-[14px] font-semibold">{title}</div>
      )}
      {filterable && (
        <label
          className={cn(
            'text-faint flex items-center gap-2.5',
            menu
              ? 'border-border bg-chrome focus-within:border-faint focus-within:bg-background mx-[18px] mt-3 mb-1.5 h-[38px] rounded-[8px] border px-3'
              : 'border-border h-[52px] border-b px-[18px] text-[15px]'
          )}
        >
          <SearchIcon className="size-4 flex-none" />
          <input
            className="text-foreground flex-1 border-0 bg-transparent outline-none"
            aria-label={title}
            placeholder={title}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      )}
      <div className={cn('max-h-[360px] overflow-auto', menu ? 'p-1' : 'p-1.5')} role="listbox">
        {shown.map((item, i) => (
          <button
            type="button"
            key={item.key}
            role="option"
            aria-selected={i === hot}
            className={cn(
              'flex w-full items-center rounded-md',
              menu ? 'gap-2.5 px-2 py-1.5' : 'gap-3 px-2.5 py-[7px]',
              i === hot && 'bg-hover'
            )}
            onMouseMove={(e) => pointerMoved(e) && setHot(i)}
            onClick={() => onPick(item.key)}
          >
            {item.glyph !== undefined ? (
              <span
                className={cn(
                  'border-border bg-background text-ink-soft grid flex-none place-items-center rounded-md border font-mono font-semibold tracking-[-0.04em]',
                  menu ? 'size-[22px] text-[9px]' : 'size-6 text-[9.5px]'
                )}
              >
                {item.glyph}
              </span>
            ) : (
              !menu && <span className="text-faint w-3.5 font-mono text-[11px]">{i + 1}</span>
            )}
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-medium">{item.label}</span>
              {!menu && item.sub !== undefined && (
                <span className="text-faint truncate font-mono text-[11px]">{item.sub}</span>
              )}
            </span>
            {item.meta !== undefined && (
              <span
                className={cn(
                  'text-faint tabular-nums',
                  menu ? 'font-mono text-[11px]' : 'text-[12px]'
                )}
              >
                {item.meta}
              </span>
            )}
          </button>
        ))}
        {shown.length === 0 && (
          <div className="text-faint px-3 py-8 text-center">
            {items.length === 0 && empty !== undefined ? empty : `Nothing matches “${query}”`}
          </div>
        )}
      </div>
      {!menu && (
        <div className="border-border bg-side text-faint flex h-9 items-center gap-4 border-t px-[18px] text-[11.5px]">
          <Hint keys="↵">open</Hint>
          <Hint keys="↑↓">move</Hint>
          <Hint keys="esc">cancel</Hint>
        </div>
      )}
    </div>
  )

  const close = (open: boolean) => !open && onClose()

  return anchor ? (
    <Popover open modal onOpenChange={close}>
      <PopoverContent
        anchor={point}
        side={'top' in anchor ? 'bottom' : 'top'}
        sideOffset={0}
        aria-label={title}
        initialFocus={firstFocus}
        className="border-border w-[248px] origin-top-left overflow-hidden rounded-xl border p-0 shadow-[0_0_0_1px_rgb(43_40_38/0.04),0_12px_32px_-12px_rgb(43_40_38/0.28)] duration-140"
      >
        {body}
      </PopoverContent>
    </Popover>
  ) : (
    <Dialog open onOpenChange={close}>
      <DialogContent
        aria-label={title}
        initialFocus={firstFocus}
        className="w-[min(600px,calc(100%-32px))] border-0 shadow-[0_0_0_1px_rgb(43_40_38/0.06),0_24px_64px_-20px_rgb(43_40_38/0.35)]"
      >
        {body}
      </DialogContent>
    </Dialog>
  )
}

function Hint({ children, keys }: { children: ReactNode; keys: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Kbd>{keys}</Kbd>
      {children}
    </span>
  )
}
