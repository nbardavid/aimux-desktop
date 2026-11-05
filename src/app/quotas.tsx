import { useState } from 'react'

import type { QuotaCache, UsageWindow } from '../model/quota'

const TOOL_LABEL = { claude: 'Claude', codex: 'Codex' } as const

function barTone(percent: number) {
  if (percent >= 85) return 'bar-critical'
  if (percent >= 60) return 'bar-warn'
  return 'bar-good'
}

function paceTone(stage: string) {
  if (stage.includes('Behind') || stage.includes('behind')) return 'warn'
  if (stage === 'onTrack') return 'faint'
  return 'add'
}

function ago(ms: number) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  return `${Math.round(s / 3600)}h ago`
}

function WindowRow({ window }: { window: UsageWindow }) {
  const percent = window.percent ?? 0
  return (
    <div className="quota-row">
      <div className="quota-line">
        <span className="quota-label">{window.label}</span>
        <span className="quota-bar">
          <span className={barTone(percent)} style={{ width: `${percent}%` }} />
        </span>
        <span className="quota-pct">
          {window.percent === null ? '—' : `${Math.round(percent)}%`}
        </span>
      </div>
      <div className="quota-meta">
        {window.timeRemaining !== null && <span>resets in {window.timeRemaining}</span>}
        {window.pace && (
          <span className={paceTone(window.pace.stage)}>
            {window.pace.label}
            {window.pace.rightText !== null && ` · ${window.pace.rightText}`}
          </span>
        )}
      </div>
    </div>
  )
}

/** Every window of every tool in the cache. */
export function QuotaWindows({ cache }: { cache: QuotaCache }) {
  return (
    <>
      {(['claude', 'codex'] as const).map((tool) => {
        const entry = cache[tool]
        if (!entry) return null
        return (
          <div key={tool} className="quota-tool">
            <div className="quota-head">
              <span>{TOOL_LABEL[tool]}</span>
              <span className="faint">
                {ago(entry.fetchedAt)}
                {entry.snapshot.planTier !== null && ` · ${entry.snapshot.planTier}`}
              </span>
            </div>
            {entry.snapshot.windows.map((w) => (
              <WindowRow key={w.kind} window={w} />
            ))}
          </div>
        )
      })}
    </>
  )
}

/** The status-bar tile and, on click, every window of every tool. */
export function Quotas({ cache, error }: { cache: QuotaCache; error: string | null }) {
  const [open, setOpen] = useState(false)
  const tools = (['claude', 'codex'] as const).filter((tool) => cache[tool] !== undefined)
  if (tools.length === 0 && error === null) return null
  return (
    <span className="quota-anchor">
      <button
        type="button"
        className="item"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {tools.map((tool) => {
          const percent = cache[tool]?.snapshot.percent
          return (
            <span key={tool} className="quota-chip">
              {TOOL_LABEL[tool]}{' '}
              <span className="num">{percent == null ? '—' : `${Math.round(percent)}%`}</span>
            </span>
          )
        })}
        {tools.length === 0 && <span className="faint">quotas unavailable</span>}
      </button>
      {open && (
        <div className="popover" role="dialog" aria-label="Quotas">
          <QuotaWindows cache={cache} />
          {error !== null && <div className="field-error">{error}</div>}
        </div>
      )}
    </span>
  )
}
