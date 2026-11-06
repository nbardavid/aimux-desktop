import { type RefObject, useEffect, useState } from 'react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/** A user turn, as the ruler marks it. Its element in the scroller carries `data-prompt`. */
export interface Prompt {
  id: string
  text: string
}

// Ticks sit on an 8px pitch, shrunk to fit down to 3px; past that, one in `step` shows.
const PITCH = 8
const MIN_PITCH = 3
// The ruler shows from this many prompts on.
const MIN_PROMPTS = 3
// Its inset from the scroller's top and bottom.
const INSET = 16

/** How `n` ticks fit in `height` px: their pitch, and which ones show (every `step`th). */
export function rulerLayout(n: number, height: number): { pitch: number; step: number } {
  if (n === 0 || height <= 0) return { pitch: PITCH, step: 1 }
  const pitch = Math.min(PITCH, height / n)
  if (pitch >= MIN_PITCH) return { pitch, step: 1 }
  const step = Math.ceil((n * MIN_PITCH) / height)
  return { pitch: Math.min(PITCH, height / Math.ceil(n / step)), step }
}

/** A prompt's first line, cut at 60 characters, for its tick's tooltip. */
export function tickLabel(text: string): string {
  const line = text.trim().split('\n')[0] ?? ''
  return line.length > 60 ? `${line.slice(0, 59).trimEnd()}…` : line
}

const smooth = (): ScrollBehavior =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'

/**
 * The turn ruler at the chat's right edge: one tick per prompt, the one being read in ink.
 * A click scrolls to that prompt. Shown only when the chat overflows and has 3 prompts.
 */
export function Minimap({
  prompts,
  scroller,
}: {
  prompts: Prompt[]
  scroller: RefObject<HTMLDivElement | null>
}) {
  const [view, setView] = useState({ current: -1, height: 0, overflow: false })
  const count = prompts.length

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const measure = () => {
      const top = el.getBoundingClientRect().top
      const line = top + el.clientHeight * 0.3
      // The last prompt whose top is above the viewport's 30% line.
      let current = -1
      for (const [i, p] of [...el.querySelectorAll('[data-prompt]')].entries()) {
        if (p.getBoundingClientRect().top <= line) current = i
      }
      const next = {
        current,
        height: el.clientHeight - 2 * INSET,
        overflow: el.scrollHeight > el.clientHeight,
      }
      setView((v) =>
        v.current === next.current && v.height === next.height && v.overflow === next.overflow
          ? v
          : next
      )
    }
    measure()
    el.addEventListener('scroll', measure, { passive: true })
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    if (el.firstElementChild) observer.observe(el.firstElementChild)
    return () => {
      el.removeEventListener('scroll', measure)
      observer.disconnect()
    }
  }, [scroller, count])

  if (!view.overflow || count < MIN_PROMPTS) return null
  const { pitch, step } = rulerLayout(count, view.height)
  const current = view.current < 0 ? -1 : view.current - (view.current % step)

  const jump = (id: string) => {
    const el = scroller.current
    const target = el?.querySelector(`[data-prompt="${CSS.escape(id)}"]`)
    if (!el || !target) return
    const top = target.getBoundingClientRect().top - el.getBoundingClientRect().top
    el.scrollTo({ behavior: smooth(), top: el.scrollTop + top - INSET })
  }

  return (
    <div
      // 24px right of the 720px column, as Conductor keeps it; the pane's edge (8px) when narrower.
      className="pointer-events-none absolute top-4 right-[max(8px,calc((100%_-_720px)/2_-_40px))] bottom-4 flex w-4 flex-col"
      aria-label="Prompts"
      role="navigation"
    >
      {prompts.map((p, i) =>
        i % step === 0 ? (
          <Tooltip key={p.id}>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  className="group/tick pointer-events-auto flex w-4 flex-none items-center justify-end"
                  style={{ height: pitch }}
                  aria-label={tickLabel(p.text)}
                  aria-current={i === current ? 'location' : undefined}
                  onClick={() => jump(p.id)}
                />
              }
            >
              <span
                className={cn(
                  'h-[1.5px] rounded-full transition-[background-color,width] duration-120 ease-out',
                  i === current
                    ? 'bg-foreground w-4'
                    : 'bg-tick group-hover/tick:bg-muted-foreground w-3'
                )}
              />
            </TooltipTrigger>
            <TooltipContent side="left" sideOffset={8}>
              {tickLabel(p.text)}
            </TooltipContent>
          </Tooltip>
        ) : null
      )}
    </div>
  )
}
