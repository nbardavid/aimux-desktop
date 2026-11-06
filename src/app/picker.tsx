import { GitBranchIcon, MessageCircleIcon, SearchIcon } from 'lucide-react'
import { type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'

import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Popover, PopoverContent } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

import type { Signal } from '../model/catalog'

import { pointerMoved } from './pointer'
import { ProjectAvatar } from './sidebar'
import { StatusDot } from './status-dot'

export interface PickerItem {
  key: string
  label: string
  sub?: string
  meta?: string
  /** What leads the row: a workspace's colour bar, a chat's bubble, a project's avatar. */
  icon?: 'workspace' | 'chat' | 'project'
  /** A faint heading over the first item of each run, while nothing is typed. */
  section?: string
  /** A status dot after the label, as the sidebar shows it. */
  signal?: Signal | null
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

/** `text` cut around the first place it contains `query` (any case): the match is `hit`. */
export function matchParts(text: string, query: string): { text: string; hit: boolean }[] {
  const at = query === '' ? -1 : text.toLowerCase().indexOf(query.toLowerCase())
  if (at === -1) return [{ hit: false, text }]
  const end = at + query.length
  return [
    { hit: false, text: text.slice(0, at) },
    { hit: true, text: text.slice(at, end) },
    { hit: false, text: text.slice(end) },
  ].filter((part) => part.text !== '')
}

/** A label with what the filter matched in ink and semibold. */
function Matched({ query, text }: { text: string; query: string }) {
  return matchParts(text, query).map((part, i) =>
    part.hit ? (
      // oxlint-disable-next-line react/no-array-index-key -- parts never move
      <span key={i} className="text-foreground font-semibold">
        {part.text}
      </span>
    ) : (
      part.text
    )
  )
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
      {!menu && !filterable && <div className="px-4 pt-4 text-base font-semibold">{title}</div>}
      {filterable && (
        <label
          className={cn(
            'text-faint flex items-center',
            menu
              ? 'border-border bg-chrome focus-within:border-line-strong focus-within:bg-background m-1 mb-0 h-8 gap-2 rounded-md border px-2'
              : 'border-border h-12 gap-2.5 border-b px-4 text-[15px]'
          )}
        >
          <SearchIcon className={cn('flex-none', menu ? 'size-3.5' : 'size-4')} />
          <input
            className="text-foreground placeholder:text-label flex-1 border-0 bg-transparent p-0 outline-none"
            aria-label={title}
            placeholder={title}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      )}
      <div className={cn('max-h-[360px] overflow-auto', menu ? 'p-1' : 'p-1.5')} role="listbox">
        {shown.map((item, i) => [
          q === '' && item.section !== undefined && item.section !== shown[i - 1]?.section && (
            <div
              key={`section:${item.section}`}
              className={cn(
                'text-label flex h-7 items-center px-2.5 text-xs font-medium',
                i > 0 && 'mt-1'
              )}
              role="presentation"
            >
              {item.section}
            </div>
          ),
          <button
            type="button"
            key={item.key}
            role="option"
            aria-selected={i === hot}
            className={cn(
              'flex w-full items-center rounded-md',
              menu ? 'h-7 gap-2 px-2' : 'gap-2.5 px-2.5',
              !menu && (item.sub === undefined ? 'h-9' : 'h-12'),
              i === hot && 'bg-accent'
            )}
            onMouseMove={(e) => pointerMoved(e) && setHot(i)}
            onClick={() => onPick(item.key)}
          >
            {item.icon !== undefined && <ItemIcon icon={item.icon} label={item.label} />}
            <span className="flex min-w-0 flex-1 flex-col">
              <span className={cn('truncate', menu ? 'text-sm' : 'text-foreground text-base')}>
                <Matched text={item.label} query={q} />
                {item.signal && (
                  <span className="ml-2 inline-flex align-middle">
                    <StatusDot signal={item.signal} />
                  </span>
                )}
              </span>
              {!menu && item.sub !== undefined && (
                <span className="text-faint truncate text-xs">
                  {/* Only when the label itself has no match. */}
                  <Matched text={item.sub} query={item.label.toLowerCase().includes(q) ? '' : q} />
                </span>
              )}
            </span>
            {item.meta !== undefined && (
              <span
                className={cn(
                  'text-faint flex-none text-xs tabular-nums',
                  menu && 'pl-4 tracking-[0.02em]'
                )}
              >
                {item.meta}
              </span>
            )}
          </button>,
        ])}
        {shown.length === 0 && (
          <div className="text-faint flex h-12 items-center px-2.5 text-sm">
            {items.length === 0 && empty !== undefined ? empty : `No match for “${query}”`}
          </div>
        )}
      </div>
      {!menu && (
        <div className="border-border bg-chrome text-faint flex h-9 items-center gap-4 border-t px-4 text-xs">
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
        className="w-[248px] p-0"
      >
        {body}
      </PopoverContent>
    </Popover>
  ) : (
    // A palette with no veil: it floats over the window, which stays as it was.
    <Dialog open onOpenChange={close}>
      <DialogContent
        aria-label={title}
        initialFocus={firstFocus}
        overlayClassName="bg-transparent"
        className="shadow-popover data-open:slide-in-from-top-[4px]! data-open:zoom-in-[0.98] top-[18vh] w-[min(640px,calc(100%-32px))] border-0 data-open:duration-160"
      >
        {body}
      </DialogContent>
    </Dialog>
  )
}

function ItemIcon({ icon, label }: { icon: NonNullable<PickerItem['icon']>; label: string }) {
  if (icon === 'project') return <ProjectAvatar name={label} />
  if (icon === 'workspace') return <GitBranchIcon className="text-faint size-4 flex-none" />
  return <MessageCircleIcon className="text-faint size-4 flex-none" />
}

// ⌘P's legend keeps the app's only boxed key caps: a key next to a word reads as a legend.
const KbdBox =
  'border-border bg-background text-faint inline-flex h-4 min-w-4 items-center justify-center rounded-sm border px-1 text-2xs font-normal'

function Hint({ children, keys }: { children: ReactNode; keys: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <kbd className={KbdBox}>{keys}</kbd>
      {children}
    </span>
  )
}
