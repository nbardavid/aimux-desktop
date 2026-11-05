import type { CSSProperties } from 'react'

import { Kbd } from '@/components/ui/kbd'
import { cn } from '@/lib/utils'

import {
  type ChatSettings,
  describe,
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

// A 4px track inked up to the value (`--fill`), and a white knob with a hairline ring.
const RANGE = [
  'm-0 mt-0.5 h-[18px] w-full cursor-pointer appearance-none bg-transparent focus-visible:outline-none',
  '[&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-[2px] [&::-webkit-slider-runnable-track]:bg-[linear-gradient(to_right,var(--foreground)_var(--fill),var(--border)_var(--fill))]',
  '[&::-webkit-slider-thumb]:-mt-1.5 [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-background [&::-webkit-slider-thumb]:shadow-[0_0_0_1px_rgb(43_40_38/0.18),0_1px_3px_rgb(43_40_38/0.2)] [&::-webkit-slider-thumb]:transition-[scale] [&::-webkit-slider-thumb]:duration-120',
  'active:[&::-webkit-slider-thumb]:scale-110 focus-visible:[&::-webkit-slider-thumb]:shadow-[0_0_0_1px_rgb(43_40_38/0.18),0_0_0_4px_rgb(194_156_135/0.35)]',
].join(' ')

/** How hard the model thinks, as one slider from Auto to the model's highest effort. */
function Intelligence({ models, onChange, value }: Props) {
  const current = models.find((m) => m.value === value.model)
  if (!current || current.efforts.length === 0) return null
  const levels = ['', ...current.efforts]
  const at = Math.max(levels.indexOf(value.effort), 0)
  const set = (i: number) => onChange({ ...value, effort: levels[i] ?? '' })
  return (
    <div className="border-border -mx-1 mt-1 -mb-1 flex flex-none flex-col gap-1.5 border-t px-3.5 py-3">
      <div className="flex justify-between text-[12.5px] font-medium">
        <span>Intelligence</span>
        <span className="text-muted-foreground tabular-nums">
          {value.effort === '' ? 'Auto' : effortLabel(value.effort)}
        </span>
      </div>
      <input
        type="range"
        className={RANGE}
        min={0}
        max={levels.length - 1}
        step={1}
        value={at}
        aria-label="Intelligence"
        aria-valuetext={short(value.effort)}
        style={{ '--fill': `${(at / (levels.length - 1)) * 100}%` } as CSSProperties}
        onChange={(e) => set(Number(e.target.value))}
        // The list owns the arrows; on the slider they move the slider.
        onKeyDown={(e) => e.stopPropagation()}
      />
      <div className="-mx-1 flex justify-between">
        {levels.map((level, i) => (
          <button
            type="button"
            key={level}
            className={cn(
              'text-label hover:text-foreground rounded-[5px] px-1 py-0.5 text-[11px] transition-[color] duration-120',
              i === at && 'text-foreground font-medium'
            )}
            onClick={() => set(i)}
          >
            {short(level)}
          </button>
        ))}
      </div>
      <span className="text-faint mt-0.5 text-[11.5px]">
        <Kbd>⇧⌘/</Kbd> steps through it
      </span>
    </div>
  )
}

/** "Opus 5.5 · High ▾": Claude Code's models to search, the intelligence slider under them. */
export function ModelSelect(props: Props) {
  const { models, onChange, value } = props
  return (
    <Combo
      button={describe(value, models)}
      options={models.map((m) => ({ hint: m.description, label: m.name, value: m.value }))}
      selected={value.model}
      placeholder="Search models"
      onPick={(model) => onChange(normalize({ ...value, model }, models))}
      footer={<Intelligence {...props} />}
    />
  )
}
