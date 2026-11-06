import { cn } from '@/lib/utils'

import type { Signal } from '../model/catalog'

import { BrailleSpinner } from './braille-spinner'

const LABEL: Record<Signal, string> = {
  done: 'Done',
  waiting: 'Waiting for you',
  working: 'Working',
}

// The `breathe` and `pop` keyframes live in styles.css; `working` is a braille orbit.
const TONE = {
  done: 'bg-good animate-[pop_0.3s_cubic-bezier(0.2,0,0,1)]',
  failing: 'bg-critical',
  idle: 'bg-neutral',
  waiting: 'bg-warn animate-[breathe_1.8s_ease-in-out_infinite]',
  working: '',
} as const

export type Tone = keyof typeof TONE

/** A status dot's classes: 7px, round, coloured by what it says (not for `working`). */
export const dotClass = (tone: Exclude<Tone, 'working'>, className?: string) =>
  cn('size-[7px] flex-none rounded-full', TONE[tone], className)

/** A status dot, or for `working` a braille orbit in the same 9px slot. */
export function Dot({ label, tone }: { tone: Tone; label?: string }) {
  const a11y = label === undefined ? {} : { 'aria-label': label, 'role': 'img' }
  if (tone === 'working')
    return (
      <span {...a11y} className="text-faint grid h-[9px] w-[9px] flex-none place-items-center">
        <BrailleSpinner loader="orbit" className="text-[13px]" />
      </span>
    )
  return <span {...a11y} className={dotClass(tone)} />
}

/** A dot alone where space is tight; `withLabel` adds the word. */
export function StatusDot({ signal, withLabel = false }: { signal: Signal; withLabel?: boolean }) {
  const dot = <Dot tone={signal} label={withLabel ? undefined : LABEL[signal]} />
  if (!withLabel) return dot
  return (
    <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs font-medium">
      {dot}
      {LABEL[signal]}
    </span>
  )
}
