import type { CSSProperties } from 'react'

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

/** How hard the model thinks, as one slider from Auto to the model's highest effort. */
function Intelligence({ models, onChange, value }: Props) {
  const current = models.find((m) => m.value === value.model)
  if (!current || current.efforts.length === 0) return null
  const levels = ['', ...current.efforts]
  const at = Math.max(levels.indexOf(value.effort), 0)
  const set = (i: number) => onChange({ ...value, effort: levels[i] ?? '' })
  return (
    <div className="iq">
      <div className="iq-head">
        <span>Intelligence</span>
        <span className="iq-value">{value.effort === '' ? 'Auto' : effortLabel(value.effort)}</span>
      </div>
      <input
        type="range"
        className="iq-range"
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
      <div className="iq-ticks">
        {levels.map((level, i) => (
          <button
            type="button"
            key={level}
            className={i === at ? 'iq-tick is-on' : 'iq-tick'}
            onClick={() => set(i)}
          >
            {short(level)}
          </button>
        ))}
      </div>
      <span className="iq-hint">
        <span className="kbd">⇧⌘/</span> steps through it
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
