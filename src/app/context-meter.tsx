// How full the chat's context window is: a ring and a percentage in the composer's toolbar,
// and what fills it on a click (Claude Code's own breakdown, as `/context` prints it), with the
// two ways to act on it (/context, /compact).
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

import { type Context, type ContextUsage, contextUsed, contextWindow } from '../chat/model'

/** 84k, 1.2M: a token count at a glance. */
export function tokens(n: number): string {
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}M`
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return String(n)
}

/** The ring's colour, the percentage's too: ink, amber past 80%, red past 95%. */
export function contextTone(share: number): 'calm' | 'warn' | 'critical' {
  if (share >= 0.95) return 'critical'
  if (share >= 0.8) return 'warn'
  return 'calm'
}

const STROKE = { calm: 'stroke-muted-foreground', critical: 'stroke-critical', warn: 'stroke-warn' }
const TEXT = { calm: 'text-faint', critical: 'text-critical-ink', warn: 'text-warn-ink' }

function Ring({ share, tone }: { share: number; tone: keyof typeof STROKE }) {
  const r = 5.5
  const length = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 14 14" className="size-3.5 -rotate-90" aria-hidden>
      <circle cx="7" cy="7" r={r} fill="none" strokeWidth="2" className="stroke-line" />
      <circle
        cx="7"
        cy="7"
        r={r}
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={`${Math.max(0.01, share) * length} ${length}`}
        className={cn('transition-[stroke-dasharray] duration-300 ease-out', STROKE[tone])}
      />
    </svg>
  )
}

export interface BreakdownRow {
  name: string
  tokens: number
  /** Of the whole window. */
  share: number
  kind: 'loaded' | 'deferred' | 'buffer' | 'free'
}

const LAST = { buffer: 2, deferred: 1, free: 3, loaded: 0 }

/** `/context`'s categories in reading order: what's loaded, largest first, then the rest. */
export function breakdown(usage: ContextUsage): BreakdownRow[] {
  const max = usage.max || 1
  return usage.categories
    .filter((c) => c.tokens > 0)
    .map((c): BreakdownRow => {
      let kind: BreakdownRow['kind'] = c.deferred ? 'deferred' : 'loaded'
      if (c.name === 'Free space') kind = 'free'
      else if (c.name === 'Autocompact buffer') kind = 'buffer'
      return { kind, name: c.name, share: c.tokens / max, tokens: c.tokens }
    })
    .sort((a, b) => LAST[a.kind] - LAST[b.kind] || (a.kind === 'loaded' ? b.tokens - a.tokens : 0))
}

/** Loaded categories go from ink to tan by rank; the rest stay quiet. */
const LOADED = [
  'bg-ink-soft',
  'bg-tan',
  'bg-ink-soft/60',
  'bg-tan/60',
  'bg-ink-soft/35',
  'bg-tan/35',
]
const QUIET = {
  buffer: 'bg-line-strong',
  deferred: 'bg-muted-foreground/25',
  free: 'bg-chrome border',
}
const swatch = (row: BreakdownRow, rank: number) =>
  row.kind === 'loaded' ? (LOADED[rank] ?? 'bg-ink-soft/20') : QUIET[row.kind]

const percentOf = (share: number) => `${(share * 100).toFixed(1)}%`

/** 13.9k, 915.6k: one decimal, as `/context` prints it. */
const fine = (n: number) => (n >= 1000 && n < 1_000_000 ? `${(n / 1000).toFixed(1)}k` : tokens(n))

function Row({ color, row }: { row: BreakdownRow; color: string }) {
  const quiet = row.kind !== 'loaded'
  return (
    <div className="flex h-5 items-center gap-2">
      <span className={cn('size-2 flex-none rounded-[2px]', color)} />
      <span className={cn('flex-1 truncate', quiet ? 'text-faint' : 'text-muted-foreground')}>
        {row.name}
      </span>
      <span className="text-faint w-14 text-right tabular-nums">{fine(row.tokens)}</span>
      <span className={cn('w-12 text-right tabular-nums', quiet && 'text-faint')}>
        {percentOf(row.share)}
      </span>
    </div>
  )
}

/** The MCP tools by server, folded: how many, what they weigh, which are loaded. */
function McpTools({ tools }: { tools: ContextUsage['mcpTools'] }) {
  const [open, setOpen] = useState(false)
  if (tools.length === 0) return null
  const total = tools.reduce((sum, t) => sum + t.tokens, 0)
  return (
    <div className="flex flex-col">
      <button
        type="button"
        className="hover:text-foreground text-muted-foreground -mx-1 flex h-6 items-center gap-1.5 rounded-md px-1 transition-colors duration-120"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <svg
          viewBox="0 0 8 8"
          className={cn('size-2 transition-transform duration-120', open && 'rotate-90')}
          aria-hidden
        >
          <path d="M2.5 1.5 5.5 4l-3 2.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
        <span className="flex-1 text-left">MCP tools</span>
        <span className="text-faint w-14 text-right tabular-nums">{fine(total)}</span>
        <span className="w-12 text-right tabular-nums">{tools.length}</span>
      </button>
      {open && (
        <div className="flex max-h-40 flex-col overflow-y-auto pl-3.5">
          {tools.map((t) => (
            <div key={t.name} className="flex h-5 items-center gap-2" title={t.name}>
              <span className={cn('flex-1 truncate', t.loaded ? '' : 'text-faint')}>
                {t.name.replace(/^mcp__[^_]+(?:_[^_]+)*?__/, '')}
              </span>
              <span className="text-faint truncate">{t.server}</span>
              <span className="text-faint w-12 text-right tabular-nums">{fine(t.tokens)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function ContextMeter({
  context,
  model,
  onOpen,
  onSend,
  usage,
}: {
  context: Context | null
  usage: ContextUsage | null
  model: string | null
  /** Runs a slash command in the chat (`/context`, `/compact`). */
  onSend: (text: string) => void
  /** The popover opened: time to ask Claude Code for its breakdown. */
  onOpen?: () => void
}) {
  const [open, setOpen] = useState(false)
  if (context === null && usage === null) return null
  const used = context ? contextUsed(context) : (usage?.total ?? 0)
  const size = context ? contextWindow(context, model) : (usage?.max ?? 200_000)
  const share = Math.min(1, used / size)
  const tone = contextTone(share)
  const percent = Math.round(share * 100)
  const rows = usage ? breakdown(usage) : null
  const run = (command: string) => {
    setOpen(false)
    onSend(command)
  }
  const shownUsed = usage?.total ?? used
  const shownSize = usage?.max ?? size
  let rank = 0
  const colored = rows?.map((row) => ({
    color: swatch(row, row.kind === 'loaded' ? rank++ : 0),
    row,
  }))
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) onOpen?.()
      }}
    >
      <PopoverTrigger
        className={cn(
          'hover:bg-hover data-popup-open:bg-hover flex h-7 items-center gap-1.5 rounded-md px-2 text-xs tabular-nums transition-colors duration-120',
          TEXT[tone]
        )}
        aria-label={`Context ${percent}% full`}
      >
        <Ring share={share} tone={tone} />
        {percent}%
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-[320px] gap-3">
        <div className="flex items-baseline justify-between">
          <span className="font-medium">Context</span>
          <span className="text-faint text-xs tabular-nums">
            {fine(shownUsed)} of {tokens(shownSize)} ·{' '}
            {Math.round((shownUsed / (shownSize || 1)) * 100)}%
          </span>
        </div>
        <div className="bg-chrome flex h-1.5 overflow-hidden rounded-full">
          {colored
            ?.filter(({ row }) => row.kind !== 'free')
            .map(({ color, row }) => (
              <span
                key={row.name}
                className={cn('h-full transition-[width] duration-300 ease-out', color)}
                style={{ width: `${row.share * 100}%` }}
              />
            ))}
        </div>
        <div
          className={cn(
            'flex flex-col gap-0.5 text-xs transition-opacity duration-150',
            colored ? 'opacity-100' : 'opacity-0'
          )}
        >
          {colored?.map(({ color, row }) => (
            <Row key={row.name} row={row} color={color} />
          ))}
          {usage && <McpTools tools={usage.mcpTools} />}
          {!colored && <div className="h-40" aria-busy />}
        </div>
        {tone !== 'calm' && (
          <p className={cn('text-xs', TEXT[tone])}>
            Claude Code compacts the chat by itself when it is full. Compact now to choose when.
          </p>
        )}
        <div className="flex items-center justify-between border-t pt-3">
          <Button variant="ghost" size="xs" className="-ml-2" onClick={() => run('/context')}>
            Full breakdown
          </Button>
          <Button
            variant={tone === 'calm' ? 'outline' : 'default'}
            size="xs"
            onClick={() => run('/compact')}
          >
            Compact now
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
