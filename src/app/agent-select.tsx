import type { RefObject } from 'react'

import { Kbd } from '@/components/ui/kbd'
import { cn } from '@/lib/utils'

import {
  agentLabel,
  type ChatSettings,
  effortLabel,
  type ModelInfo,
  normalize,
} from '../model/agents'
import { Combo } from './combo'

interface Props {
  value: ChatSettings
  models: ModelInfo[]
  onChange: (s: ChatSettings) => void
}

const short = (effort: string) => {
  if (effort === '') return 'Auto'
  return effort === 'xhigh' ? 'X-High' : effortLabel(effort)
}

/** How hard the model thinks, as one slider from Auto to the model's highest effort. */
function Intelligence({ models, onChange, value }: Props) {
  const current = models.find((m) => m.value === value.model)
  if (!current || current.efforts.length === 0) return null
  const levels = ['', ...current.efforts]
  const at = Math.max(levels.indexOf(value.effort), 0)
  const set = (i: number) => onChange({ ...value, effort: levels[i] ?? '' })
  return (
    <div className="border-border -mx-1 mt-1 -mb-1 flex flex-none flex-col gap-1.5 border-t p-3">
      <div className="flex justify-between text-sm">
        <span className="font-medium">Intelligence</span>
        <span className="text-muted-foreground tabular-nums">
          {value.effort === '' ? 'Auto' : effortLabel(value.effort)}
        </span>
      </div>
      {/*
        A slider whose stops sit at the centre of each level's name: the track runs from the
        first name's centre to the last's, a dot marks every stop, the knob snaps between them.
        A native range, invisible, on top, gives drag, keys and accessibility.
      */}
      <div
        className="relative grid"
        style={{ gridTemplateColumns: `repeat(${levels.length}, minmax(0, 1fr))` }}
      >
        {/* The container: a recessed well the knob travels in, nothing else inked. */}
        <div className="bg-chrome pointer-events-none absolute inset-x-0 top-0 h-7 rounded-lg shadow-[inset_0_0_0_1px_rgb(43_40_38/0.06)]">
          <div
            className="absolute inset-y-0"
            style={{ left: `${50 / levels.length}%`, right: `${50 / levels.length}%` }}
          >
            {levels.map((level, i) => (
              <span
                key={level}
                className={cn(
                  'absolute top-1/2 h-1.5 w-px -translate-1/2 rounded-full transition-opacity duration-200',
                  'bg-foreground/20',
                  i === at && 'opacity-0'
                )}
                style={{ left: `${(i / (levels.length - 1)) * 100}%` }}
              />
            ))}
            <span
              className="bg-foreground absolute top-1/2 h-5 w-2.5 -translate-1/2 rounded-[4px] shadow-[0_1px_2px_rgb(43_40_38/0.25)] transition-[left] duration-200 ease-out"
              style={{ left: `${(at / (levels.length - 1)) * 100}%` }}
            />
          </div>
        </div>
        <input
          type="range"
          className="absolute top-0 m-0 h-7 cursor-pointer opacity-0"
          // The knob's travel: from the first stop to the last, so a drag lands where it points.
          style={{
            left: `calc(${50 / levels.length}% - 8px)`,
            width: `calc(${100 - 100 / levels.length}% + 16px)`,
          }}
          min={0}
          max={levels.length - 1}
          step={1}
          value={at}
          aria-label="Intelligence"
          aria-valuetext={short(value.effort)}
          onChange={(e) => set(Number(e.target.value))}
          // The list owns the arrows; on the slider they move the slider.
          onKeyDown={(e) => e.stopPropagation()}
        />
        {levels.map((level, i) => (
          <button
            type="button"
            key={level}
            tabIndex={-1}
            className={cn(
              'mt-9 text-center text-xs transition-colors duration-120 ease-out',
              i === at ? 'text-foreground font-medium' : 'text-faint hover:text-foreground'
            )}
            onClick={() => set(i)}
          >
            {short(level)}
          </button>
        ))}
      </div>
      <span className="text-faint mt-0.5 text-xs">
        <Kbd>⇧⌘/</Kbd> steps through it
      </span>
    </div>
  )
}

interface SelectProps extends Props {
  className?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
  finalFocus?: RefObject<HTMLElement | null>
}

/** "Opus 5.5 · High ▾", as the chat's footer and the composer both say it: Claude Code's
 * models to search, the intelligence slider under them. */
export function ModelSelect(props: SelectProps) {
  const { models, onChange, value } = props
  const [name, effort] = agentLabel(value, models).split(' · ')
  return (
    <Combo
      // "Opus 5.5" in ink, "· High" in the button's own grey.
      button={
        <>
          <span className="text-foreground font-medium">{name}</span>
          {effort !== undefined && <span>· {effort}</span>}
        </>
      }
      className={props.className}
      open={props.open}
      onOpenChange={props.onOpenChange}
      finalFocus={props.finalFocus}
      options={models.map((m) => ({
        hint: m.description,
        label: m.name,
        value: m.value,
      }))}
      selected={value.model}
      placeholder="Search models"
      onPick={(model) => onChange(normalize({ ...value, model }, models))}
      footer={<Intelligence models={models} value={value} onChange={onChange} />}
    />
  )
}
