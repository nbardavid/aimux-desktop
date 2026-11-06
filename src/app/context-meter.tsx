// How full the chat's context window is: a ring and a percentage in the composer's toolbar,
// and what fills it on a click, with the two ways to act on it (/context, /compact).
import { useState } from 'react'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

import { type Context, contextUsed, contextWindow } from '../chat/model'

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

export function ContextMeter({
  context,
  model,
  onSend,
}: {
  context: Context | null
  model: string | null
  /** Runs a slash command in the chat (`/context`, `/compact`). */
  onSend: (text: string) => void
}) {
  const [open, setOpen] = useState(false)
  if (context === null) return null
  const used = contextUsed(context)
  const size = contextWindow(context, model)
  const share = Math.min(1, used / size)
  const tone = contextTone(share)
  const percent = Math.round(share * 100)
  const parts = [
    {
      className: 'bg-ink-soft',
      label: 'Conversation',
      tip: 'Read from the cache',
      value: context.cached,
    },
    {
      className: 'bg-tan',
      label: 'This turn',
      tip: 'Added by the last request',
      value: context.added,
    },
    { className: 'bg-muted-foreground/50', label: 'Last answer', tip: '', value: context.output },
  ]
  const run = (command: string) => {
    setOpen(false)
    onSend(command)
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
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
      <PopoverContent side="top" align="end" className="w-[264px] gap-3">
        <div className="flex items-baseline justify-between">
          <span className="font-medium">Context</span>
          <span className="text-faint text-xs tabular-nums">
            {tokens(used)} of {tokens(size)} · {percent}%
          </span>
        </div>
        <div className="bg-chrome flex h-1.5 overflow-hidden rounded-full">
          {parts.map((p) => (
            <span
              key={p.label}
              className={cn('h-full transition-[width] duration-300 ease-out', p.className)}
              style={{ width: `${(p.value / size) * 100}%` }}
            />
          ))}
        </div>
        <div className="flex flex-col gap-1 text-xs">
          {[
            ...parts,
            {
              className: 'bg-chrome border',
              label: 'Free',
              tip: '',
              value: Math.max(0, size - used),
            },
          ].map((p) => (
            <div key={p.label} className="flex h-5 items-center gap-2" title={p.tip || undefined}>
              <span className={cn('size-2 flex-none rounded-[2px]', p.className)} />
              <span className="text-muted-foreground flex-1">{p.label}</span>
              <span className="tabular-nums">{tokens(p.value)}</span>
            </div>
          ))}
        </div>
        {tone !== 'calm' && (
          <p className={cn('text-xs', TEXT[tone])}>
            Claude Code compacts the chat by itself when it is full. Compact now to choose when.
          </p>
        )}
        <div className="-mx-1 flex gap-1 border-t pt-2">
          <button
            type="button"
            className="hover:bg-hover text-muted-foreground hover:text-foreground h-7 flex-1 rounded-md text-xs transition-colors duration-120"
            onClick={() => run('/context')}
          >
            Full breakdown
          </button>
          <button
            type="button"
            className="hover:bg-hover text-muted-foreground hover:text-foreground h-7 flex-1 rounded-md text-xs transition-colors duration-120"
            onClick={() => run('/compact')}
          >
            Compact
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
