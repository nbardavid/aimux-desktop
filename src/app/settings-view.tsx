import { invoke } from '@tauri-apps/api/core'
import { useEffect, useState } from 'react'

import { effectiveValue, type Row, SECTIONS, type SettingValue } from '../settings/schema'

type Stored = Record<string, SettingValue>

function Control({
  onChange,
  row,
  value,
}: {
  row: Row
  value: SettingValue
  onChange: (v: SettingValue) => void
}) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])

  if (row.kind === 'toggle') {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={value === true}
        aria-label={row.label}
        className={value === true ? 'switch is-on' : 'switch'}
        onClick={() => onChange(value !== true)}
      />
    )
  }
  if (row.kind === 'select') {
    return (
      <div className="segmented" role="radiogroup" aria-label={row.label}>
        {row.options.map((option) => (
          <button
            type="button"
            key={option}
            role="radio"
            aria-checked={value === option}
            className={value === option ? 'seg is-on' : 'seg'}
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
    )
  }
  const commit = () => {
    if (row.kind === 'number') {
      const n = Number(draft)
      if (Number.isFinite(n)) onChange(Math.min(row.max, Math.max(row.min, n)))
      else setDraft(String(value))
    } else if (draft !== value) {
      onChange(draft)
    }
  }
  return (
    <input
      className={row.kind === 'number' ? 'input input-num' : 'input'}
      aria-label={row.label}
      type={row.kind === 'number' ? 'number' : 'text'}
      {...(row.kind === 'number'
        ? { max: row.max, min: row.min, step: row.step }
        : { placeholder: row.placeholder })}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  )
}

/** Writes straight into aimux.json; the TUI reads it when it starts. */
export function SettingsView() {
  const [stored, setStored] = useState<Stored | null>(null)
  const [path, setPath] = useState('aimux.json')
  const [error, setError] = useState<string | null>(null)
  const [section, setSection] = useState(SECTIONS[0]?.id)

  useEffect(() => {
    void invoke<{ path: string; settings: Stored }>('read_settings').then(
      (read) => {
        setPath(read.path)
        setStored(read.settings)
      },
      (error_: unknown) => setError(String(error_))
    )
  }, [])

  const write = (id: string, value: SettingValue | null) => {
    invoke('write_setting', { id, value })
      .then(() =>
        setStored((state) => {
          const next = { ...state }
          if (value === null) delete next[id]
          else next[id] = value
          return next
        })
      )
      .catch((error_: unknown) => setError(String(error_)))
  }

  const shown = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0]
  return (
    <div className="page">
      <nav className="page-nav" aria-label="Settings sections">
        {SECTIONS.map((s) => (
          <button
            type="button"
            key={s.id}
            className={s.id === shown?.id ? 'nav-item is-active' : 'nav-item'}
            aria-current={s.id === shown?.id}
            onClick={() => setSection(s.id)}
          >
            {s.label}
          </button>
        ))}
      </nav>
      <div className="page-body">
        <h1 className="section-title">{shown?.label}</h1>
        <p className="page-note">
          Saved in <span className="mono">{path}</span>. The TUI reads them when it starts; a value
          set in aimux.config.ts wins over this screen.
        </p>
        {error !== null && <div className="field-error">{error}</div>}
        {stored && (
          <div className="rows">
            {shown?.rows.map((row) => {
              const value = effectiveValue(row, stored[row.id])
              const changed = stored[row.id] !== undefined
              return (
                <div className="row" key={row.id}>
                  <div className="row-text">
                    <span className="row-label">
                      {row.label}
                      {'restart' in row && row.restart === true && (
                        <span className="tag">restart</span>
                      )}
                    </span>
                    <span className="row-help">{row.help}</span>
                  </div>
                  <div className="row-control">
                    <Control row={row} value={value} onChange={(v) => write(row.id, v)} />
                    <button
                      type="button"
                      className="reset"
                      aria-label={`Reset ${row.label}`}
                      disabled={!changed}
                      onClick={() => write(row.id, null)}
                    >
                      Reset
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
