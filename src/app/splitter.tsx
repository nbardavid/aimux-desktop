import type { KeyboardEvent, PointerEvent } from 'react'

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

/** A 1 px line with a wider grab area; drag it, or focus it and use the arrows. */
export function Splitter({ direction, label, max, min, onChange, value }: Props) {
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const start = e.clientX
    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)
    const move = (ev: globalThis.PointerEvent) =>
      onChange(clamp(value + direction * (ev.clientX - start), min, max))
    const up = () => {
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', up)
      document.body.classList.remove('resizing')
    }
    document.body.classList.add('resizing')
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', up)
  }
  const onKeyDown = (e: KeyboardEvent) => {
    const step = { ArrowLeft: -16, ArrowRight: 16 }[e.key]
    if (step === undefined) return
    e.preventDefault()
    onChange(clamp(value + direction * step, min, max))
  }
  return (
    <div
      className="splitter"
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
