import { type ReactNode, type RefObject, useLayoutEffect, useRef, useState } from 'react'

import {
  Combobox,
  ComboboxContent,
  ComboboxHint,
  ComboboxItem,
  ComboboxList,
  ComboboxSearch,
  ComboboxTrigger,
} from '@/components/ui/combobox'
import { cn } from '@/lib/utils'

export interface ComboOption {
  value: string
  label: string
  hint?: string
  /** A heading shown above the first option of each run; dropped while searching. */
  section?: string
}

interface Props {
  button: ReactNode
  options: ComboOption[]
  selected: string
  placeholder: string
  onPick: (value: string) => void
  footer?: ReactNode
  /** Extra classes for the button. */
  className?: string
  /** Which edge of the button the list lines up with. */
  align?: 'start' | 'end'
  /** How far the list sits in from that edge (a button with a negative margin). */
  alignOffset?: number
  /** Extra classes for the list's sheet. */
  popupClassName?: string
  /** Where focus goes once the list closes (the button by default). */
  finalFocus?: RefObject<HTMLElement | null>
  /** Opened from elsewhere too (a typed `/model`): the open state, and its changes. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

const GAP = 6
const MARGIN = 12

/** A button that opens a searchable list, above or below it, wherever the window has room. */
export function Combo({
  align = 'start',
  alignOffset,
  button,
  className,
  finalFocus,
  footer,
  onOpenChange: tellOpen,
  onPick,
  open: openProp,
  options,
  placeholder,
  popupClassName,
  selected,
}: Props) {
  const [ownOpen, setOwnOpen] = useState(false)
  const open = openProp ?? ownOpen
  const setOpen = (next: boolean) => {
    setOwnOpen(next)
    tellOpen?.(next)
  }
  const [query, setQuery] = useState('')
  const [room, setRoom] = useState({ height: 360, up: true })
  const trigger = useRef<HTMLButtonElement>(null)
  const q = query.trim().toLowerCase()
  const seen = new Set<string>()
  const shown = options.filter((o) => {
    if (q === '') return true
    if (seen.has(o.value) || !`${o.label} ${o.value}`.toLowerCase().includes(q)) return false
    seen.add(o.value)
    return true
  })

  // Measured as it opens, however it was opened: the list goes where the window has room.
  useLayoutEffect(() => {
    const box = trigger.current?.getBoundingClientRect()
    if (!box || !open) return
    const above = box.top - GAP - MARGIN
    const below = window.innerHeight - box.bottom - GAP - MARGIN
    setRoom({ height: Math.min(420, Math.max(above, below)), up: above >= below })
  }, [open])

  return (
    <Combobox
      open={open}
      onOpenChange={setOpen}
      value={selected}
      onValueChange={(value) => {
        if (value === null) return
        onPick(value)
        setOpen(false)
        setQuery('')
      }}
      inputValue={query}
      onInputValueChange={(value, details) => {
        if (details.reason === 'input-change') setQuery(value)
      }}
      filter={null}
      autoHighlight
    >
      <ComboboxTrigger
        ref={trigger}
        className={cn(
          'rounded-[8px] [&>svg:last-child]:transition-transform [&>svg:last-child]:duration-150 [&>svg:last-child]:ease-[cubic-bezier(0.2,0,0,1)] data-popup-open:[&>svg:last-child]:rotate-180',
          className
        )}
      >
        {button}
      </ComboboxTrigger>
      <ComboboxContent
        side={room.up ? 'top' : 'bottom'}
        align={align}
        alignOffset={alignOffset}
        aria-label={placeholder}
        finalFocus={finalFocus}
        style={{ maxHeight: room.height }}
        className={cn(
          'shadow-[0_0_0_1px_rgb(43_40_38/0.06),0_16px_40px_-14px_rgb(43_40_38/0.32)]',
          popupClassName
        )}
      >
        <ComboboxSearch aria-label={placeholder} placeholder={placeholder} />
        <ComboboxList className="flex min-h-[60px] flex-col pt-0">
          {shown.map((o, i) => (
            <div key={`${o.section ?? ''}:${o.value}`}>
              {q === '' && o.section !== undefined && o.section !== shown[i - 1]?.section && (
                <div
                  className={cn(
                    'text-label px-2.5 pb-1 text-[11px] font-medium',
                    i === 0 ? 'pt-0.5' : 'pt-2'
                  )}
                >
                  {o.section}
                </div>
              )}
              <ComboboxItem value={o.value} className="data-selected:pr-8 pr-2.5">
                <span className="flex-none font-medium whitespace-nowrap">{o.label}</span>
                {o.hint !== undefined && (
                  <ComboboxHint className="text-[12px]">{o.hint}</ComboboxHint>
                )}
              </ComboboxItem>
            </div>
          ))}
          {shown.length === 0 && (
            <div className="text-faint px-3 py-8 text-center">Nothing matches “{query}”</div>
          )}
        </ComboboxList>
        {footer}
      </ComboboxContent>
    </Combobox>
  )
}
