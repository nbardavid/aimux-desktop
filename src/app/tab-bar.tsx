import { MessageCircleIcon, PlusIcon, SquareTerminalIcon, XIcon } from 'lucide-react'
import {
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Kbd } from '@/components/ui/kbd'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/menu'
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

/** Below this, a tab says too little: the ones that would go under it wait in "+N". */
const TAB_MIN = 100
/** The "+N" button's room. */
const MORE_WIDTH = 40

/**
 * Which tabs the bar shows in `width` px, and which wait in the "+N" menu. The one on screen
 * always shows, at its own width (`activeWidth`); then the first others, as many as keep
 * ~100px each. The bar keeps its order.
 */
export function splitTabs<T extends { id: string }>(
  items: T[],
  activeId: string | undefined,
  width: number,
  activeWidth = TAB_MIN
): { shown: T[]; hidden: T[] } {
  const active = items.find((t) => t.id === activeId)
  const own = active ? activeWidth : 0
  const others = items.filter((t) => t !== active)
  if (own + others.length * TAB_MIN <= width) return { hidden: [], shown: items }
  const fit = Math.max(0, Math.floor((width - MORE_WIDTH - own) / TAB_MIN))
  const kept = new Set<T>(others.slice(0, active ? fit : Math.max(fit, 1)))
  if (active) kept.add(active)
  return {
    hidden: items.filter((t) => !kept.has(t)),
    shown: items.filter((t) => kept.has(t)),
  }
}

/**
 * The tabs as drawn: `next`, with each of `prev` that left it kept in its place (after the
 * last neighbour that stayed) while it slides shut.
 */
export function withLeaving<T extends { id: string }>(prev: readonly T[], next: readonly T[]): T[] {
  const out = [...next]
  for (const [i, t] of prev.entries()) {
    if (out.some((o) => o.id === t.id)) continue
    const before = prev.slice(0, i).findLast((p) => out.some((o) => o.id === p.id))
    out.splice(before ? out.findIndex((o) => o.id === before.id) + 1 : 0, 0, t)
  }
  return out
}

/**
 * What the bar draws after a change, from what it drew last (`prev`, and the ids of every
 * tab then): the tabs `shown`, each tab closed since still in its place while it slides shut
 * (until `gone`), and which tabs just opened (`entering`). A tab that only moved into or out
 * of "+N" (a window resized) neither enters nor leaves: it is there or not, at once. A wholly
 * new set (another workspace) just shows.
 */
export function tabsToDraw<T extends { id: string }>(
  prev: { drawn: readonly T[]; ids: readonly string[] },
  items: readonly T[],
  shown: readonly T[],
  gone: ReadonlySet<string>
): { drawn: T[]; entering: ReadonlySet<string> } {
  const ids = new Set(items.map((t) => t.id))
  const kept = prev.drawn.filter(
    (t) => shown.some((s) => s.id === t.id) || (!ids.has(t.id) && !gone.has(t.id))
  )
  if (!kept.some((t) => shown.some((s) => s.id === t.id))) {
    return { drawn: [...shown], entering: new Set() }
  }
  return {
    drawn: withLeaving(kept, shown),
    entering: new Set(shown.filter((t) => !prev.ids.includes(t.id)).map((t) => t.id)),
  }
}

const still = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * A tab's slot: it grows from nothing as it opens and shrinks to nothing as it closes
 * (DESIGN.md: 160ms ease-out, width and a fade), its neighbours following.
 */
function TabSlot({
  children,
  className,
  enter,
  leave,
  onContextMenu,
  onGone,
  onWidth,
}: {
  enter: boolean
  leave: boolean
  onGone: () => void
  /** Its own width (not a slide's), whenever it changes: given to the tab on screen. */
  onWidth?: (width: number) => void
  className: string
  onContextMenu?: (e: MouseEvent) => void
  children: ReactNode
}) {
  const box = useRef<HTMLDivElement>(null)
  const gone = useRef(onGone)
  gone.current = onGone
  const report = useRef(onWidth)
  report.current = onWidth
  const tells = onWidth !== undefined
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    // Mid-slide, the slot is as wide as the slide: its own width was told before it began.
    const measure = () => el.style.maxWidth === '' && report.current?.(el.offsetWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [tells])
  // Each slide runs once (StrictMode runs effects twice, the second mid-slide).
  const slid = useRef<'enter' | 'leave' | null>(null)
  const slide = (from: number, to: number, end: () => void) => {
    const el = box.current
    if (!el) return
    Object.assign(el.style, {
      maxWidth: `${from}px`,
      minWidth: '0px',
      opacity: from === 0 ? '0' : '1',
    })
    el.getBoundingClientRect()
    el.style.transition = 'max-width 160ms ease-out, opacity 160ms ease-out'
    Object.assign(el.style, { maxWidth: `${to}px`, opacity: to === 0 ? '0' : '1' })
    let done = false
    const finish = () => {
      if (done) return
      done = true
      el.removeEventListener('transitionend', onEnd)
      end()
    }
    const onEnd = (e: TransitionEvent) => {
      if (e.target === el && e.propertyName === 'max-width') finish()
    }
    el.addEventListener('transitionend', onEnd)
    // A tab scrolled out of sight may never report its end.
    setTimeout(finish, 260)
  }
  useLayoutEffect(() => {
    const el = box.current
    if (!enter || !el || still() || slid.current !== null) return
    slid.current = 'enter'
    report.current?.(el.offsetWidth)
    slide(0, el.offsetWidth, () => {
      for (const p of ['max-width', 'min-width', 'opacity', 'transition'])
        el.style.removeProperty(p)
    })
  }, [enter])
  useLayoutEffect(() => {
    const el = box.current
    if (!leave || !el || slid.current === 'leave') return
    slid.current = 'leave'
    if (still()) gone.current()
    else slide(el.offsetWidth, 0, () => gone.current())
  }, [leave])
  return (
    <div ref={box} className={className} inert={leave} onContextMenu={onContextMenu}>
      {children}
    </div>
  )
}

/** A 16px fade on the side where tabs scroll out of sight. */
function edgeMask(left: boolean, right: boolean): CSSProperties | undefined {
  if (!left && !right) return undefined
  const mask = `linear-gradient(to right, ${left ? 'transparent' : '#000'}, #000 16px, #000 calc(100% - 16px), ${right ? 'transparent' : '#000'})`
  return { maskImage: mask }
}

/** A name edited in place: Enter or a click away keeps it (trimmed), Esc drops it (null). */
export function RenameField({
  className,
  label,
  onDone,
  value,
}: {
  value: string
  label: string
  className?: string
  onDone: (name: string | null) => void
}) {
  const field = useRef<HTMLInputElement>(null)
  // Focus first: `/rename` starts it while the composer has the focus.
  useEffect(() => {
    field.current?.focus()
    field.current?.select()
  }, [])
  return (
    <Input
      ref={field}
      className={cn(
        'bg-hover text-foreground h-auto flex-1 rounded-md border-0 px-1.5 py-[3px] shadow-[inset_0_0_0_1px_var(--line-strong)] focus-visible:ring-0',
        className
      )}
      aria-label={label}
      defaultValue={value}
      spellCheck={false}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          // Dropped: the blur that follows changes nothing.
          e.currentTarget.dataset.dropped = ''
          onDone(null)
        }
      }}
      onBlur={(e) => {
        if (e.currentTarget.dataset.dropped === undefined) onDone(e.currentTarget.value.trim())
      }}
    />
  )
}

/**
 * A tab's button: its title (cut only when the bar is full) and its status; a terminal's has
 * its icon first, the one mark that tells the two kinds apart. On hover: the whole title and
 * its ⌃1–9 key. The tooltip is a popup: the bar scrolls, and
 * would clip a `data-tip`.
 */
function TabButton({
  active,
  armed,
  index,
  item,
  onRename,
  onSelect,
}: {
  item: TabItem
  /** Its place in the bar: the first nine answer to ⌃1–9. */
  index: number
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
  return (
    <Tooltip disabled={armed || (!cut && index >= 9)}>
      <TooltipTrigger
        render={
          <button
            type="button"
            role="tab"
            aria-selected={active}
            className="flex h-full max-w-[240px] min-w-0 flex-1 items-center gap-1.5 px-3"
            onClick={onSelect}
            onDoubleClick={onRename}
          />
        }
      >
        {!item.chat && <SquareTerminalIcon className="text-label size-3.5 shrink-0" />}
        {/* Both labels in one cell, cross-fading: the title alone sizes the tab, so arming
            it moves nothing; the question truncates in the title's room. */}
        <span className="grid min-w-0">
          <span
            ref={title}
            className={cn(
              'col-start-1 row-start-1 truncate transition-opacity duration-120 ease-out',
              armed && 'opacity-0'
            )}
          >
            {item.title}
          </span>
          <span
            className={cn(
              'text-critical col-start-1 row-start-1 w-0 min-w-full truncate transition-opacity duration-120 ease-out',
              !armed && 'opacity-0'
            )}
            aria-hidden={!armed}
          >
            Close? ⌘W again
          </span>
        </span>
        {item.signal && <StatusDot signal={item.signal} />}
      </TooltipTrigger>
      {/* The whole title, wrapped: a tip that cuts it would only repeat the tab. */}
      <TooltipContent className="max-w-[360px] items-start whitespace-normal">
        <span className="min-w-0 wrap-break-word">{item.title}</span>
        {index < 9 && <Kbd className="flex-none text-white/60">⌃{index + 1}</Kbd>}
      </TooltipContent>
    </Tooltip>
  )
}

export function TabBar(props: Props) {
  const { activeId, armedId, items, renamingId } = props
  const room = useRef<HTMLDivElement>(null)
  const strip = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(Infinity)
  // The tab on screen keeps its title's width: what is left is shared by the others.
  const [activeWidth, setActiveWidth] = useState<number>()
  const [fade, setFade] = useState({ left: false, right: false })
  const { hidden, shown } = splitTabs(items, activeId, width, activeWidth)
  const activeTitle = items.find((t) => t.id === activeId)?.title
  // What was drawn last: a tab closed slides shut in place, a new one slides open.
  const last = useRef<{ drawn: TabItem[]; ids: string[]; activeId: string | undefined }>({
    activeId,
    drawn: shown,
    ids: items.map((t) => t.id),
  })
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set())
  const { drawn, entering } = tabsToDraw(last.current, items, shown, gone)
  const prevActive = last.current.activeId
  useLayoutEffect(() => {
    last.current = { activeId, drawn, ids: items.map((t) => t.id) }
  })

  // The room the tabs have: everything but the + after them.
  useEffect(() => {
    const el = room.current
    if (!el) return
    const observer = new ResizeObserver(() => setWidth(el.clientWidth - 36))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const edges = () => {
    const el = strip.current
    if (!el) return
    const left = el.scrollLeft > 0
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
    setFade((f) => (f.left === left && f.right === right ? f : { left, right }))
  }
  // The tab on screen is brought into view whenever it or the bar changes (a long rename or
  // "Close?" can still push it out); a scroll by hand is left alone otherwise. Its width comes
  // from its slot (onWidth), whatever changed it: its title, its status dot, a font.
  useLayoutEffect(() => {
    // Not a closing tab sliding shut (inert), which keeps its old look.
    const tab = strip.current?.querySelector(':not([inert]) > [role=tab][aria-selected=true]')
    tab?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    edges()
  }, [activeId, activeTitle, armedId, renamingId, shown.length, width])

  return (
    <div className="flex min-w-0 flex-1 items-stretch" ref={room}>
      <div
        ref={strip}
        className="flex min-w-0 flex-[0_1_auto] items-stretch overflow-x-auto [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label="Tabs"
        style={edgeMask(fade.left, fade.right)}
        onScroll={edges}
      >
        {drawn.map((item) => {
          const leaving = !shown.includes(item)
          const index = items.indexOf(item)
          // A closing tab keeps the look it had, so it shrinks from where it was.
          const active = leaving ? item.id === prevActive : item.id === activeId
          const armed = item.id === armedId
          return (
            // The tab on screen keeps its title's width (up to 240px); the others share what
            // is left evenly, each stopping at its own width, down to 72px.
            <TabSlot
              key={item.id}
              enter={entering.has(item.id)}
              leave={leaving}
              onGone={() => setGone((g) => new Set(g).add(item.id))}
              onWidth={active && !leaving ? setActiveWidth : undefined}
              className={cn(
                "group text-faint hover:text-muted-foreground relative flex max-w-max min-w-[72px] flex-[1_1_0%] items-center text-sm transition-[color] duration-120 ease-out after:absolute after:right-2.5 after:bottom-0 after:left-2.5 after:h-0.5 after:scale-x-0 after:rounded-t-[1px] after:bg-tan after:transition-[scale] after:duration-220 after:ease-[cubic-bezier(0.2,0,0,1)] after:content-['']",
                active &&
                  'text-foreground hover:text-foreground flex-none font-medium after:scale-x-100'
              )}
              onContextMenu={(e) => {
                e.preventDefault()
                if (!leaving) props.onMenu(item, e.clientX, e.clientY)
              }}
            >
              {item.id === renamingId ? (
                <RenameField
                  className="mr-1 ml-1.5 font-medium"
                  label="Tab name"
                  value={item.title}
                  onDone={(title) => props.onRenamed(item, title === '' ? null : title)}
                />
              ) : (
                <TabButton
                  item={item}
                  index={index}
                  active={active}
                  armed={armed}
                  onSelect={() => props.onSelect(item)}
                  onRename={() => props.onRename(item)}
                />
              )}
              {/* Over the title's end on hover, on a fade, rather than a slot kept empty. */}
              <span className="from-chrome/0 to-chrome pointer-events-none absolute inset-y-0 right-0 flex items-center bg-linear-to-r to-40% pr-1 pl-5 opacity-0 transition-opacity duration-120 group-focus-within:opacity-100 group-hover:opacity-100">
                <Button
                  variant="ghost"
                  size="icon"
                  className="pointer-events-auto size-5 rounded-sm"
                  aria-label={`Close ${item.title}`}
                  onClick={() => props.onClose(item)}
                >
                  <XIcon className="size-3.5" />
                </Button>
              </span>
            </TabSlot>
          )
        })}
      </div>
      {hidden.length > 0 && (
        <Menu>
          <MenuTrigger
            render={
              <Button
                variant="ghost"
                className="text-muted-foreground my-auto h-6 flex-none rounded-md px-1.5 text-xs tabular-nums"
                aria-label={`${hidden.length} more tabs`}
              />
            }
          >
            +{hidden.length}
          </MenuTrigger>
          <MenuContent align="end" className="max-w-[360px]">
            {hidden.map((item) => {
              const Icon = item.chat ? MessageCircleIcon : SquareTerminalIcon
              const index = items.indexOf(item)
              return (
                <MenuItem key={item.id} onClick={() => props.onSelect(item)}>
                  <Icon className="p-px" />
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                  {item.signal && <StatusDot signal={item.signal} />}
                  {index < 9 && <Kbd>⌃{index + 1}</Kbd>}
                </MenuItem>
              )
            })}
          </MenuContent>
        </Menu>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="mx-1 my-auto"
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
