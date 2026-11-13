// The controls Settings is made of: one look for each kind of value, all ending on the card's
// right edge, all driven by the keyboard.

import { Slider as SliderPrimitive } from '@base-ui/react/slider'
import { ChevronsUpDownIcon, ImagePlusIcon, MinusIcon, PlusIcon } from 'lucide-react'
import { type KeyboardEvent, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuTrigger } from '@/components/ui/menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

import { BrailleDots, BrailleSpinner } from './braille-spinner'
import { useLoaderChoice } from './loader-choice'
import { isLoader, type Loader, LOADER_LABELS } from './loaders'
import { WallpaperCanvas } from './wallpaper'
import { isWallpaper, type Wallpaper } from './wallpapers'

/** The outline trigger a menu or picker opens from. */
const triggerClass =
  'border-border bg-background hover:border-line-strong data-popup-open:border-line-strong inline-flex h-7 min-w-[132px] items-center gap-2 rounded-md border pr-1.5 pl-2.5 text-sm transition-[border-color,background-color] duration-120 ease-out outline-none'

export function Switch({
  checked,
  label,
  onChange,
}: {
  checked: boolean
  label: string
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="bg-line-strong aria-checked:bg-foreground relative h-[18px] w-8 flex-none rounded-full transition-[background-color] duration-150 ease-[ease] after:absolute after:top-0.5 after:left-0.5 after:size-3.5 after:rounded-full after:bg-white after:shadow-[0_1px_2px_rgb(43_40_38/0.2)] after:transition-transform after:duration-150 after:ease-[cubic-bezier(0.2,0,0,1)] aria-checked:after:translate-x-3.5"
      onClick={() => onChange(!checked)}
    />
  )
}

/**
 * A value by feel: the track follows the pointer at once, the setting is written when it is
 * let go (`onCommit`), so a drag writes once.
 */
export function Slider({
  disabled,
  format,
  label,
  max,
  min,
  onCommit,
  step,
  value,
}: {
  value: number
  min: number
  max: number
  step: number
  label: string
  disabled?: boolean
  format: (v: number) => string
  onCommit: (v: number) => void
}) {
  const [live, setLive] = useState(value)
  useEffect(() => setLive(value), [value])
  return (
    <div className={cn('flex items-center gap-3', disabled === true && 'opacity-45')}>
      <SliderPrimitive.Root
        className="w-40"
        value={live}
        min={min}
        max={max}
        step={step}
        largeStep={step * 5}
        disabled={disabled}
        onValueChange={(v) => setLive(v)}
        onValueCommitted={(v) => onCommit(v)}
      >
        <SliderPrimitive.Control className="flex h-5 w-full cursor-pointer touch-none items-center select-none data-disabled:cursor-default">
          <SliderPrimitive.Track className="bg-line-strong relative h-1 w-full rounded-full">
            <SliderPrimitive.Indicator className="bg-foreground rounded-full" />
            <SliderPrimitive.Thumb
              aria-label={label}
              className="size-3.5 rounded-full bg-white shadow-[0_0_0_1px_rgb(43_40_38/0.12),0_1px_3px_rgb(43_40_38/0.25)] outline-none focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--tan)_45%,transparent)]"
            />
          </SliderPrimitive.Track>
        </SliderPrimitive.Control>
      </SliderPrimitive.Root>
      <span className="text-muted-foreground w-10 text-right text-xs tabular-nums">
        {format(live)}
      </span>
    </div>
  )
}

/** An exact value: − 12.5 +, and ↑/↓ while focused. */
export function Stepper({
  label,
  max,
  min,
  onChange,
  step,
  value,
}: {
  value: number
  min: number
  max: number
  step: number
  label: string
  onChange: (v: number) => void
}) {
  const by = (n: number) =>
    onChange(Math.min(max, Math.max(min, Math.round((value + n) * 100) / 100)))
  return (
    <div
      className="border-border bg-background flex h-7 items-center rounded-md border"
      role="spinbutton"
      tabIndex={0}
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp') by(step)
        else if (e.key === 'ArrowDown') by(-step)
        else return
        e.preventDefault()
      }}
    >
      <Button
        variant="ghost"
        size="icon-sm"
        tabIndex={-1}
        aria-label={`Smaller ${label}`}
        disabled={value <= min}
        onClick={() => by(-step)}
      >
        <MinusIcon />
      </Button>
      <span className="w-10 text-center text-sm tabular-nums">{value}</span>
      <Button
        variant="ghost"
        size="icon-sm"
        tabIndex={-1}
        aria-label={`Larger ${label}`}
        disabled={value >= max}
        onClick={() => by(step)}
      >
        <PlusIcon />
      </Button>
    </div>
  )
}

/** A few short values on one scale. */
export function Segmented({
  label,
  onChange,
  options,
  value,
}: {
  options: string[]
  value: string
  label: string
  onChange: (v: string) => void
}) {
  return (
    <div
      className="bg-hover inline-flex gap-0.5 rounded-lg p-0.5"
      role="radiogroup"
      aria-label={label}
      onKeyDown={(e) => arrowPick(e, options, value, onChange)}
    >
      {options.map((option) => (
        <button
          type="button"
          key={option}
          role="radio"
          aria-checked={value === option}
          tabIndex={value === option ? 0 : -1}
          className="text-muted-foreground hover:text-foreground aria-checked:bg-background aria-checked:text-foreground h-6 min-w-11 rounded-md px-2.5 text-xs font-medium tabular-nums transition-[color,background-color,box-shadow] duration-120 ease-out aria-checked:shadow-[0_0_0_1px_var(--border),0_1px_2px_rgb(43_40_38/0.06)]"
          onClick={() => onChange(option)}
        >
          {option}
        </button>
      ))}
    </div>
  )
}

/** ←/→ (and ↑/↓) move a radio group's choice and its focus. */
function arrowPick(
  e: KeyboardEvent<HTMLElement>,
  options: string[],
  value: string,
  onChange: (v: string) => void
) {
  const by = { ArrowDown: 1, ArrowLeft: -1, ArrowRight: 1, ArrowUp: -1 }[e.key]
  if (by === undefined) return
  e.preventDefault()
  const i = Math.max(0, options.indexOf(value))
  const next = options[(i + by + options.length) % options.length]
  if (next === undefined) return
  onChange(next)
  const radios = e.currentTarget.querySelectorAll<HTMLElement>('[role=radio]')
  radios[options.indexOf(next)]?.focus()
}

/** A list of values, as a menu under an outline trigger. */
export function SelectMenu({
  label,
  onChange,
  options,
  value,
}: {
  options: string[]
  value: string
  label: string
  onChange: (v: string) => void
}) {
  return (
    <Menu>
      <MenuTrigger className={triggerClass} aria-label={label}>
        <span className="flex-1 text-left">{value}</span>
        <ChevronsUpDownIcon className="text-faint size-3" />
      </MenuTrigger>
      <MenuContent align="end" className="min-w-[160px]">
        <MenuRadioGroup value={value} onValueChange={(v: string) => onChange(v)}>
          {options.map((option) => (
            <MenuRadioItem key={option} value={option}>
              {option}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  )
}

/** A loader, picked from a grid of them all playing; the trigger plays the current one. */
export function LoaderPicker({
  dots,
  label,
  onChange,
  options,
  value,
}: {
  options: string[]
  value: string
  label: string
  /** The status loader is drawn as ink dots, as the sidebar shows it. */
  dots: boolean
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const loaders = options.filter(isLoader)
  const draw = (loader: Loader, className?: string) =>
    dots ? (
      <BrailleDots loader={loader} className={className} />
    ) : (
      <BrailleSpinner loader={loader} className={cn('text-[15px]', className)} />
    )
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={triggerClass} aria-label={label}>
        <span className="grid min-w-4 place-items-center">{isLoader(value) && draw(value)}</span>
        <span className="flex-1 text-left">{isLoader(value) ? LOADER_LABELS[value] : value}</span>
        <ChevronsUpDownIcon className="text-faint size-3" />
      </PopoverTrigger>
      <PopoverContent align="end" aria-label={label} className="w-[384px] p-1.5">
        <div
          className="grid grid-cols-6 gap-1"
          role="radiogroup"
          aria-label={label}
          onKeyDown={(e) => {
            const by = { ArrowDown: 6, ArrowLeft: -1, ArrowRight: 1, ArrowUp: -6 }[e.key]
            if (by === undefined) return
            e.preventDefault()
            const radios = [...e.currentTarget.querySelectorAll<HTMLElement>('[role=radio]')]
            const i = radios.indexOf(document.activeElement as HTMLElement)
            radios[Math.min(radios.length - 1, Math.max(0, i + by))]?.focus()
          }}
        >
          {loaders.map((loader) => (
            <button
              type="button"
              key={loader}
              role="radio"
              aria-checked={value === loader}
              autoFocus={value === loader}
              className="text-muted-foreground hover:bg-hover hover:text-foreground focus-visible:bg-hover aria-checked:bg-active aria-checked:text-foreground flex h-14 flex-col items-center justify-center gap-1.5 rounded-md transition-[color,background-color] duration-120 ease-out outline-none"
              onClick={() => {
                onChange(loader)
                setOpen(false)
              }}
            >
              {dots ? (
                <BrailleDots loader={loader} />
              ) : (
                <BrailleSpinner loader={loader} className="text-[15px]" />
              )}
              <span className="text-2xs">{LOADER_LABELS[loader]}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** A text value, written when it is left or on Enter. */
export function TextField({
  label,
  mono,
  onChange,
  placeholder,
  value,
}: {
  value: string
  label: string
  placeholder?: string
  mono?: boolean
  onChange: (v: string) => void
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <Input
      className={cn('h-7 w-60 px-2.5', mono === true && 'font-mono text-xs')}
      aria-label={label}
      placeholder={placeholder}
      value={draft}
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onChange(draft)}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  )
}

/**
 * The chat backgrounds as tiles: None, the scenes, and the user's own picture. The Image tile
 * asks for a picture while it has none; with one, a click only selects it.
 */
export function BackgroundTiles({
  adding,
  image,
  onAdd,
  onChange,
  options,
  value,
}: {
  options: string[]
  value: string
  /** The picked picture, as a data URL; '' while there is none. */
  image: string
  /** A picture is being read and scaled. */
  adding: boolean
  onAdd: () => void
  onChange: (v: Wallpaper) => void
}) {
  const names = options.filter(isWallpaper)
  const { status } = useLoaderChoice()
  const pick = (name: Wallpaper) => (name === 'Image' && image === '' ? onAdd() : onChange(name))
  return (
    <div
      className="grid grid-cols-4 gap-3"
      role="radiogroup"
      aria-label="Background"
      onKeyDown={(e) => {
        // Arrows move between tiles that are ready; an empty Image tile is picked with Enter.
        const ready = names.filter((n) => n !== 'Image' || image !== '')
        arrowPick(e, ready, value, (v) => isWallpaper(v) && onChange(v))
      }}
    >
      {names.map((name) => {
        const checked = value === name
        let caption: string = name
        if (name === 'Image' && adding) caption = 'Adding…'
        else if (name === 'Image' && image === '') caption = 'Add image…'
        return (
          <button
            type="button"
            key={name}
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            disabled={name === 'Image' && adding}
            className="group/tile text-muted-foreground hover:text-foreground aria-checked:text-foreground flex flex-col gap-2 text-left transition-[color] duration-120 ease-out outline-none"
            onClick={() => pick(name)}
          >
            <span
              className={cn(
                'border-border bg-background relative aspect-[16/10] w-full overflow-hidden rounded-md border transition-[outline-color,border-color] duration-120 ease-out',
                'outline-2 outline-offset-2 outline-transparent',
                'group-hover/tile:border-line-strong group-aria-checked/tile:outline-foreground',
                'group-focus-visible/tile:outline-[color-mix(in_srgb,var(--tan)_70%,transparent)]',
                name === 'Image' && image === '' && 'bg-chrome'
              )}
            >
              {name !== 'None' && name !== 'Image' && (
                <WallpaperCanvas name={name} cell={3} className="size-full" />
              )}
              {name === 'Image' && image !== '' && (
                <img
                  src={image}
                  alt=""
                  draggable={false}
                  className={cn(
                    'animate-in fade-in size-full object-cover duration-300',
                    adding && 'opacity-40'
                  )}
                />
              )}
              {name === 'Image' && (image === '' || adding) && (
                <span className="text-faint absolute inset-0 grid place-items-center">
                  {adding ? <BrailleDots loader={status} /> : <ImagePlusIcon className="size-4" />}
                </span>
              )}
            </span>
            <span className="text-xs font-medium">{caption}</span>
          </button>
        )
      })}
    </div>
  )
}
