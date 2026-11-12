import { Check, X } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'

import { cn } from '@/lib/utils'

import { BrailleDots } from './braille-spinner'
import { useLoaderChoice } from './loader-choice'

export type StepState = 'pending' | 'active' | 'done' | 'failed'

export interface Step {
  key: string
  title: string
  /** Under the title: what it works on, or why it failed. */
  detail?: string
  state: StepState
}

/** One row's mark: a ring waiting, the loader working, a check done, a cross failed. */
function Mark({ state }: { state: StepState }) {
  const loaders = useLoaderChoice()
  return (
    <span className="relative grid size-4 flex-none place-items-center">
      <span
        className={cn(
          'border-line-strong absolute size-2 rounded-full border transition-[opacity,transform] duration-160 ease-out',
          state !== 'pending' && 'scale-50 opacity-0'
        )}
      />
      <span
        className={cn(
          'text-foreground absolute transition-opacity duration-160 ease-out',
          state !== 'active' && 'opacity-0'
        )}
      >
        {state === 'active' && <BrailleDots loader={loaders.working} />}
      </span>
      <span
        className={cn(
          'bg-good absolute grid size-4 place-items-center rounded-full text-white transition-[opacity,transform] duration-200 ease-out',
          state === 'done' ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
        )}
      >
        <Check className="size-2.5" strokeWidth={3} />
      </span>
      <span
        className={cn(
          'bg-critical absolute grid size-4 place-items-center rounded-full text-white transition-[opacity,transform] duration-200 ease-out',
          state === 'failed' ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
        )}
      >
        <X className="size-2.5" strokeWidth={3} />
      </span>
    </span>
  )
}

/**
 * A new workspace getting ready, drawn as the chat it is about to be: the prompt already in
 * its bubble, and where Claude answers, the steps joined by a line that fills as each ends.
 * It fades out once the chat takes its place.
 */
// Each change on screen gets as long as the line takes to fill: the next mark changes the
// moment the line reaches it.
const STEP_MS = 280

/**
 * The steps as shown: they follow the real ones one change at a time, so a fast launch
 * still plays every check. `onSettled` hears when the screen has caught up.
 */
function useShown(steps: Step[], onSettled?: () => void) {
  const [shown, setShown] = useState<Record<string, Step['state']>>({})
  const next = steps.find((s) => (shown[s.key] ?? 'pending') !== s.state)
  useEffect(() => {
    if (next === undefined) {
      onSettled?.()
      return
    }
    // The first one shows at once; failures too, the user has to act on them.
    const wait = Object.keys(shown).length === 0 || next.state === 'failed' ? 0 : STEP_MS
    const timer = setTimeout(() => setShown((all) => ({ ...all, [next.key]: next.state })), wait)
    return () => clearTimeout(timer)
  }, [next, onSettled, shown])
  return steps.map((s) => ({ ...s, state: shown[s.key] ?? 'pending' }))
}

export function LaunchSteps({
  actions,
  leaving,
  onSettled,
  prompt,
  steps: real,
}: {
  /** Once every step on screen has caught up with the real ones. */
  onSettled?: () => void
  prompt: string
  steps: Step[]
  leaving: boolean
  actions?: ReactNode
}) {
  const steps = useShown(real, onSettled)
  const settled = steps.every((s, i) => s.state === real[i]?.state)
  return (
    <div
      className={cn(
        'min-h-0 flex-1 overflow-auto transition-opacity duration-160 ease-in',
        leaving && 'opacity-0'
      )}
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-[768px] flex-col gap-6 px-6 pt-7 pb-6">
        {prompt !== '' && (
          <div className="bg-bubble text-ink-soft animate-in fade-in slide-in-from-bottom-[6px] max-w-[80%] self-end rounded-lg px-3.5 py-[11px] text-base wrap-anywhere whitespace-pre-wrap duration-240 ease-out">
            {prompt}
          </div>
        )}
        <div className="flex flex-col self-start">
          <ol className="flex flex-col">
            {steps.map((step, i) => {
              const last = i === steps.length - 1
              return (
                <li
                  key={step.key}
                  className="animate-in fade-in slide-in-from-bottom-[4px] flex gap-3 duration-200 ease-out"
                  style={{ animationDelay: `${i * 60}ms`, animationFillMode: 'both' }}
                >
                  <div className="flex flex-col items-center">
                    <Mark state={step.state} />
                    {!last && (
                      <span className="bg-border relative my-1 w-px flex-1 overflow-hidden rounded-full">
                        <span
                          className={cn(
                            'bg-good absolute inset-0 origin-top transition-transform ease-in-out',
                            step.state === 'done' ? 'scale-y-100' : 'scale-y-0'
                          )}
                          style={{ transitionDuration: `${STEP_MS}ms` }}
                        />
                      </span>
                    )}
                  </div>
                  <div className={cn('flex min-w-0 flex-col pb-5', last && 'pb-0')}>
                    <span
                      className={cn(
                        'text-sm leading-4 transition-colors duration-160 ease-out',
                        step.state === 'pending' && 'text-label',
                        step.state === 'active' && 'text-foreground font-medium',
                        step.state === 'done' && 'text-muted-foreground',
                        step.state === 'failed' && 'text-critical-ink font-medium'
                      )}
                    >
                      {step.title}
                    </span>
                    {step.detail !== undefined && (
                      <span
                        className={cn(
                          'mt-0.5 truncate text-xs',
                          step.state === 'failed' ? 'text-critical-ink' : 'text-faint'
                        )}
                        title={step.detail}
                      >
                        {step.detail}
                      </span>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
          {settled && actions !== undefined && actions !== null && (
            <div className="animate-in fade-in mt-4 flex gap-2 pl-7 duration-200">{actions}</div>
          )}
        </div>
      </div>
    </div>
  )
}
