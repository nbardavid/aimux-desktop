import { cn } from '@/lib/utils'

import type { Signal } from '../model/catalog'

const LABEL: Record<Signal, string> = {
  done: 'Done',
  waiting: 'Waiting for you',
  working: 'Working',
}

// The `breathe`, `pop` and `spin` keyframes live in styles.css.
const TONE = {
  done: 'bg-good animate-[pop_0.3s_cubic-bezier(0.2,0,0,1)]',
  failing: 'bg-critical',
  idle: 'bg-neutral',
  waiting: 'bg-warn animate-[breathe_1.8s_ease-in-out_infinite]',
  working:
    'size-[9px] border-[1.5px] border-faint border-t-transparent animate-[spin_0.9s_linear_infinite]',
} as const

/** A status dot's classes: 7px, round, coloured (or spinning) by what it says. */
export const dotClass = (tone: keyof typeof TONE, className?: string) =>
  cn('size-[7px] flex-none rounded-full', TONE[tone], className)

/** A dot alone where space is tight; `withLabel` adds the word. */
export function StatusDot({ signal, withLabel = false }: { signal: Signal; withLabel?: boolean }) {
  const dot = (
    <span
      className={dotClass(signal)}
      role={withLabel ? undefined : 'img'}
      aria-label={withLabel ? undefined : LABEL[signal]}
    />
  )
  if (!withLabel) return dot
  return (
    <span className="text-muted-foreground inline-flex items-center gap-1.5 text-[12px] font-medium">
      {dot}
      {LABEL[signal]}
    </span>
  )
}
