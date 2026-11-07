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
      {/* One segment per level, inked up to the chosen one, its name right under it. */}
      <div
        role="radiogroup"
        aria-label="Intelligence"
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${levels.length}, minmax(0, 1fr))` }}
        // The list owns the arrows; here they step the level.
        onKeyDown={(e) => {
          const step = { ArrowLeft: -1, ArrowRight: 1 }[e.key]
          e.stopPropagation()
          if (step === undefined) return
          e.preventDefault()
          set(Math.min(levels.length - 1, Math.max(0, at + step)))
        }}
      >
        {levels.map((level, i) => (
          <button
            type="button"
            role="radio"
            aria-checked={i === at}
            tabIndex={i === at ? 0 : -1}
            key={level}
            className="group flex cursor-pointer flex-col items-stretch gap-1.5 rounded-sm pt-1 focus-visible:outline-none"
            onClick={() => set(i)}
          >
            <span
              className={cn(
                'h-1 rounded-full transition-colors duration-150 ease-out',
                i <= at ? 'bg-foreground' : 'bg-border group-hover:bg-faint',
                'group-focus-visible:ring-ring/50 group-focus-visible:ring-2'
              )}
            />
            <span
              className={cn(
                'text-center text-xs transition-colors duration-120 ease-out',
                i === at ? 'text-foreground font-medium' : 'text-faint group-hover:text-foreground'
              )}
            >
              {short(level)}
            </span>
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
