import { useEffect, useRef } from 'react'

import { cn } from '@/lib/utils'

import { frameAt, type Loader, LOADERS } from './loaders'

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
