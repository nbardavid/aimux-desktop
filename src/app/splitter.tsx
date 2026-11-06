import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

interface Props {
  label: string
  value: number
  min: number
  max: number
  /** +1 when dragging right grows the panel (the sidebar), -1 when it shrinks it (the git panel). */
  direction: 1 | -1
  onChange: (width: number) => void
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(v)))

/** The panel's width as drawn: it may follow the window rather than a stored value. */
function drawn(splitter: HTMLElement, direction: 1 | -1, value: number) {
  const panel = direction === 1 ? splitter.previousElementSibling : splitter.nextElementSibling
  return panel?.getBoundingClientRect().width ?? value
}

/** A 1 px line with a wider grab area; drag it, or focus it and use the arrows. */
export function Splitter({ direction, label, max, min, onChange, value }: Props) {
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const start = e.clientX
    const target = e.currentTarget
    const from = drawn(target, direction, value)
    target.setPointerCapture(e.pointerId)
    const move = (ev: globalThis.PointerEvent) =>
      onChange(clamp(from + direction * (ev.clientX - start), min, max))
    const up = () => {
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', up)
      document.body.classList.remove('resizing')
    }
    document.body.classList.add('resizing')
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', up)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowLeft: -16, ArrowRight: 16 }[e.key]
    if (step === undefined) return
    e.preventDefault()
    onChange(clamp(drawn(e.currentTarget, direction, value) + direction * step, min, max))
  }
  return (
    <div
      className="bg-border hover:bg-line-strong active:bg-line-strong focus-visible:bg-line-strong relative z-2 w-px flex-none cursor-col-resize transition-[background-color] duration-150 before:absolute before:inset-y-0 before:-inset-x-1 focus-visible:outline-none"
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    />
  )
}

const still = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * A panel that slides its width open and shut (⌘B, ⌥⌘B; DESIGN.md: 200ms ease-in-out). The
 * panel inside keeps its own width, so nothing reflows mid-way; it unmounts once shut.
 * Only a toggle slides (`data-sliding`, until its transition ends): a window resized, or a
 * splitter dragged, moves it at once. Reduced motion: no transition.
 */
export function Slide({
  children,
  onSliding,
  open,
  width,
  widthKey,
}: {
  open: boolean
  /** The panel's width, its splitter's 1px included. */
  width: string
  /** A change of key (a list ↔ a page) slides to the new width; a drag doesn't. */
  widthKey?: string
  /** While it slides: a native view laid over the panel waits for it to settle. */
  onSliding?: (sliding: boolean) => void
  children: ReactNode
}) {
  const [mounted, setMounted] = useState(open)
  const [wide, setWide] = useState(open)
  const [sliding, setSliding] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  // Told in the same layout pass, so a native view over the panel never sees a first frame
  // that still reads as settled.
  const report = useRef(onSliding)
  report.current = onSliding
  const slide = useCallback((on: boolean) => {
    setSliding(on)
    report.current?.(on)
  }, [])
  const openRef = useRef(open)
  openRef.current = open
  const settle = useCallback(() => {
    slide(false)
    if (!openRef.current) setMounted(false)
  }, [slide])
  useLayoutEffect(() => {
    if (open && !mounted) setMounted(true)
    else if (open && !wide) {
      // Its zero width is laid out first, so the change from it transitions.
      box.current?.getBoundingClientRect()
      setWide(true)
      slide(!still())
    } else if (!open && wide) {
      setWide(false)
      slide(!still())
      if (still()) setMounted(false)
    }
  }, [open, mounted, wide, slide])
  // A slide whose transition never ends (a splitter grabbed mid-way cancels it) still settles.
  useEffect(() => {
    if (!sliding) return
    const done = setTimeout(settle, 300)
    return () => clearTimeout(done)
  }, [sliding, settle])
  // The width on screen: a new key first marks the box sliding, then moves the width, so the
  // change transitions. A width that ends up the same fires no transitionend: the timer ends it.
  const [applied, setApplied] = useState(width)
  const key = useRef(widthKey)
  useLayoutEffect(() => {
    if (key.current === widthKey || !open || !wide || still()) {
      key.current = widthKey
      setApplied(width)
      return
    }
    key.current = widthKey
    slide(true)
    const frame = requestAnimationFrame(() => setApplied(width))
    return () => cancelAnimationFrame(frame)
  }, [width, widthKey, open, wide, slide])
  if (!mounted) return null
  return (
    <div
      ref={box}
      className="flex min-h-0 flex-none overflow-hidden data-sliding:transition-[width] data-sliding:duration-200 data-sliding:ease-in-out in-[.resizing]:transition-none motion-reduce:transition-none"
      style={{ width: wide ? applied : 0 }}
      data-sliding={sliding || undefined}
      onTransitionEnd={(e) => e.target === e.currentTarget && settle()}
      onTransitionCancel={(e) => e.target === e.currentTarget && settle()}
    >
      {children}
    </div>
  )
}
