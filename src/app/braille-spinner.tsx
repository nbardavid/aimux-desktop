import { useEffect, useLayoutEffect, useRef } from 'react'

import { cn } from '@/lib/utils'

import { frameAt, litDots, type Loader, LOADERS, stillFrame } from './loaders'

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * A braille loader. It writes its frames straight into the DOM, so a list of them costs
 * no React renders; with reduced motion it holds one frame.
 */
export function BrailleSpinner({ className, loader }: { loader: Loader; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const draw = () => {
      el.textContent = frameAt(loader, Date.now())
    }
    draw()
    if (reducedMotion()) return
    const timer = setInterval(draw, LOADERS[loader].interval)
    return () => clearInterval(timer)
  }, [loader])
  return (
    <span
      ref={ref}
      aria-hidden
      className={cn('flex-none font-mono leading-none whitespace-pre select-none', className)}
    >
      {LOADERS[loader].frames[0]}
    </span>
  )
}

/** A dot's pitch and its diameter, in px: 2px dots, 1px apart. */
const PITCH = 3
const SIZE = 2

/**
 * A braille loader drawn as dots rather than as a font's glyph: centred on the pixel, the
 * same box on every frame, only the lit dots shown, in the text colour. 4 rows of dots
 * (11px) by 2 per glyph. Like the spinner, it sets the dots' visibility straight in the DOM.
 */
export function BrailleDots({ className, loader }: { loader: Loader; className?: string }) {
  const ref = useRef<SVGSVGElement>(null)
  const columns = (LOADERS[loader].frames[0] ?? '').length * 2
  useLayoutEffect(() => {
    const dots = [...(ref.current?.children ?? [])]
    const show = (frame: string) => {
      const lit = new Set(litDots(frame).map(([row, col]) => row * columns + col))
      for (const [i, dot] of dots.entries())
        dot.setAttribute('visibility', lit.has(i) ? 'visible' : 'hidden')
    }
    if (reducedMotion()) {
      show(stillFrame(loader))
      return
    }
    const draw = () => show(frameAt(loader, Date.now()))
    draw()
    const timer = setInterval(draw, LOADERS[loader].interval)
    return () => clearInterval(timer)
  }, [loader, columns])
  const width = columns * PITCH - (PITCH - SIZE)
  const height = 4 * PITCH - (PITCH - SIZE)
  return (
    <svg
      ref={ref}
      aria-hidden
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn('flex-none fill-current', className)}
    >
      {Array.from({ length: 4 * columns }, (_, i) => (
        <circle
          key={i}
          cx={(i % columns) * PITCH + SIZE / 2}
          cy={Math.floor(i / columns) * PITCH + SIZE / 2}
          r={SIZE / 2}
          visibility="hidden"
        />
      ))}
    </svg>
  )
}
