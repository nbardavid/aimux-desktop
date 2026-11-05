import { invoke } from '@tauri-apps/api/core'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

import { effectiveValue, type Row, SECTIONS, type SettingValue } from '../settings/schema'

type Stored = Record<string, SettingValue>

/** A card of rows; a second card sits 16px under the first. */
const rowsClass = 'max-w-[820px] divide-y overflow-hidden rounded-2xl border [&+&]:mt-4'
const rowClass = 'flex items-center justify-between gap-6 px-4 py-3'
const rowText = 'flex min-w-0 flex-col gap-0.5'
const rowHelp = 'text-muted-foreground text-[12.5px]'
const rowControl = 'flex flex-none items-center gap-2.5'
const fieldError = 'text-critical text-[12.5px] wrap-anywhere'

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
        className="relative h-[18px] w-8 rounded-full bg-[#d4d5d8] transition-[background-color] duration-150 ease-[ease] after:absolute after:top-0.5 after:left-0.5 after:size-3.5 after:rounded-full after:bg-white after:shadow-[0_1px_2px_rgb(43_40_38/0.2)] after:transition-transform after:duration-150 after:ease-[cubic-bezier(0.2,0,0,1)] aria-checked:bg-foreground aria-checked:after:translate-x-3.5"
        onClick={() => onChange(value !== true)}
      />
    )
  }
  if (row.kind === 'select') {
    return (
      <div
        className="bg-hover inline-flex gap-0.5 self-start rounded-[8px] p-0.5"
        role="radiogroup"
        aria-label={row.label}
      >
        {row.options.map((option) => (
          <button
            type="button"
            key={option}
            role="radio"
            aria-checked={value === option}
            className="text-muted-foreground hover:text-foreground aria-checked:bg-background aria-checked:text-foreground h-6 rounded-md px-2.5 text-[12px] font-medium aria-checked:font-semibold aria-checked:shadow-[0_0_0_1px_var(--border),0_1px_2px_rgb(43_40_38/0.06)]"
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
    <Input
      className={cn(
        'h-8 px-[11px]',
        row.kind === 'number' ? 'w-[104px] tabular-nums' : 'w-[240px]'
      )}
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

/** Restarting the host closes its terminals, so it asks twice; chats resume from transcripts. */
function RestartHost({
  onRestart,
  terminals,
}: {
  onRestart: () => Promise<void>
  terminals: number
}) {
  const [armed, setArmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const again =
    terminals === 0
      ? 'Click again'
      : `Click again: closes ${terminals} ${terminals === 1 ? 'terminal' : 'terminals'}`
  return (
    <div className={rowsClass}>
      <div className={rowClass}>
        <div className={rowText}>
          <span className="flex items-center gap-2 font-medium">Background process</span>
          <span className={error === null ? rowHelp : fieldError}>
            {error ??
              'Runs your chats and terminals, and keeps them going while the window is closed.'}
          </span>
        </div>
        <div className={rowControl} onMouseLeave={() => setArmed(false)}>
          <Button
            type="button"
            variant={armed ? 'destructive' : 'outline'}
            className={cn(armed && 'hover:bg-[color-mix(in_srgb,var(--critical)_88%,black)]')}
            disabled={busy}
            onClick={() => {
              if (!armed) {
                setArmed(true)
                return
              }
              setBusy(true)
              void onRestart().catch((error_: unknown) => {
                setBusy(false)
                setArmed(false)
                setError(String(error_))
              })
            }}
          >
            {armed ? again : 'Restart background process'}
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Writes straight into settings.json; a new workspace reads it when it is made. */
export function SettingsView({
  onRestartHost,
  terminals,
}: {
  onRestartHost: () => Promise<void>
  /** Terminals that restarting the background process would close. */
  terminals: number
}) {
  const [stored, setStored] = useState<Stored | null>(null)
  const [path, setPath] = useState('settings.json')
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
    <div className="flex min-h-0 min-w-0 flex-1">
      <nav
        className="bg-side flex w-[200px] flex-none flex-col gap-px border-r px-1.5 py-2.5"
        aria-label="Settings sections"
      >
        {SECTIONS.map((s) => (
          <button
            type="button"
            key={s.id}
            className={cn(
              'h-8 rounded-[8px] px-2.5 text-[13.5px] font-medium',
              s.id === shown?.id
                ? 'bg-active text-foreground'
                : 'text-muted-foreground hover:bg-hover hover:text-foreground'
            )}
            aria-current={s.id === shown?.id}
            onClick={() => setSection(s.id)}
          >
            {s.label}
          </button>
        ))}
      </nav>
      <div className="min-w-0 flex-1 overflow-auto px-9 pt-7 pb-12">
        <h1 className="m-0 mb-1 text-[20px] font-semibold tracking-[-0.02em]">{shown?.label}</h1>
        <p className="text-muted-foreground m-0 mb-5 max-w-[68ch] text-[12.5px] leading-normal">
          Saved in <span className="font-mono text-[11px]">{path}</span>.
        </p>
        {error !== null && <div className={fieldError}>{error}</div>}
        {stored && (
          <div className={rowsClass}>
            {shown?.rows.map((row) => {
              const value = effectiveValue(row, stored[row.id])
              const changed = stored[row.id] !== undefined
              return (
                <div className={rowClass} key={row.id}>
                  <div className={rowText}>
                    <span className="flex items-center gap-2 font-medium">{row.label}</span>
                    <span className={rowHelp}>{row.help}</span>
                  </div>
                  <div className={rowControl}>
                    <Control row={row} value={value} onChange={(v) => write(row.id, v)} />
                    <button
                      type="button"
                      className="text-faint hover:text-foreground w-10 text-[12px] disabled:invisible"
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
        <RestartHost terminals={terminals} onRestart={onRestartHost} />
      </div>
    </div>
  )
}
