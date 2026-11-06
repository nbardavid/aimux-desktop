import { invoke } from '@tauri-apps/api/core'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

import { effectiveValue, type Row, SECTIONS, type SettingValue } from '../settings/schema'
import { BrailleSpinner } from './braille-spinner'
import { previewCleanup } from './cleanup-effect'
import { noteLoaderSetting } from './loader-choice'
import { isLoader, LOADER_LABELS } from './loaders'

type Stored = Record<string, SettingValue>

/** A card of rows. */
const rowsClass = 'divide-y overflow-hidden rounded-lg border'
const rowClass = 'group/row flex items-center justify-between gap-6 px-4 py-3'
const rowText = 'flex min-w-0 flex-col gap-0.5'
const rowHelp = 'text-muted-foreground text-xs'
/** The controls: one column, every one ending on the card's right padding. */
const rowControl = 'flex flex-none items-center gap-2'
const fieldError = 'text-critical-ink text-xs wrap-anywhere'

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
        className="relative h-[18px] w-8 rounded-full bg-line-strong transition-[background-color] duration-150 ease-[ease] after:absolute after:top-0.5 after:left-0.5 after:size-3.5 after:rounded-full after:bg-white after:shadow-[0_1px_2px_rgb(43_40_38/0.2)] after:transition-transform after:duration-150 after:ease-[cubic-bezier(0.2,0,0,1)] aria-checked:bg-foreground aria-checked:after:translate-x-3.5"
        onClick={() => onChange(value !== true)}
      />
    )
  }
  if (row.kind === 'select' && row.preview === 'loader') {
    return (
      <div className="grid grid-cols-6 gap-1.5" role="radiogroup" aria-label={row.label}>
        {row.options.filter(isLoader).map((loader) => (
          <button
            type="button"
            key={loader}
            role="radio"
            aria-checked={value === loader}
            className="bg-chrome text-muted-foreground hover:text-foreground aria-checked:border-line-strong aria-checked:bg-background aria-checked:text-foreground flex h-14 flex-col items-center justify-center gap-1.5 rounded-md border border-transparent transition-[color,background-color,border-color] duration-120 ease-out hover:bg-hover"
            onClick={() => onChange(loader)}
          >
            <BrailleSpinner loader={loader} className="text-[15px]" />
            <span className="text-2xs">{LOADER_LABELS[loader]}</span>
          </button>
        ))}
      </div>
    )
  }
  if (row.kind === 'select') {
    return (
      <div
        className="bg-hover inline-flex gap-0.5 self-start rounded-lg p-0.5"
        role="radiogroup"
        aria-label={row.label}
      >
        {row.options.map((option) => (
          <button
            type="button"
            key={option}
            role="radio"
            aria-checked={value === option}
            className="text-muted-foreground hover:text-foreground aria-checked:bg-background aria-checked:text-foreground h-6 rounded-md px-2.5 text-xs font-medium aria-checked:font-semibold aria-checked:shadow-[0_0_0_1px_var(--border),0_1px_2px_rgb(43_40_38/0.06)]"
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

const count = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

/**
 * When a row's Reset shows: always while its value differs from the default, on hover when
 * one is stored that equals it (Reset then only forgets it), never when nothing is stored.
 */
export function resetShown(
  stored: SettingValue | undefined,
  fallback: SettingValue,
  value: SettingValue
): 'always' | 'hover' | 'never' {
  if (stored === undefined) return 'never'
  return value === fallback ? 'hover' : 'always'
}

/** What the second click says it will do, as the restart bar says it. */
export function restartWarning(chats: number, terminals: number): string {
  const clauses = [
    chats > 0 && `pauses ${count(chats, 'working chat')}`,
    terminals > 0 && `closes ${count(terminals, 'terminal')}`,
  ].filter(Boolean)
  return clauses.length === 0 ? 'Click again to restart' : `Click again: ${clauses.join(', ')}`
}

/** A group's heading, above its card. */
const groupTitle = 'text-label mb-2 px-1 text-xs font-medium'

/** Restarting the host closes its terminals, so it asks twice; chats resume from transcripts. */
function RestartHost({
  chats,
  onRestart,
  terminals,
}: {
  onRestart: () => Promise<void>
  chats: number
  terminals: number
}) {
  const [armed, setArmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  let label = 'Restart'
  if (busy) label = 'Restarting…'
  else if (armed) label = restartWarning(chats, terminals)
  return (
    <div className={rowsClass}>
      <div className={rowClass}>
        <div className={rowText}>
          <span className="flex items-center gap-2 font-medium">Chats and terminals</span>
          <span className={error === null ? rowHelp : fieldError}>
            {error ??
              'Run in the background, and keep going while the window is closed. A restart pauses working chats (they resume) and closes terminals.'}
          </span>
        </div>
        <div className={rowControl} onMouseLeave={() => setArmed(false)}>
          <Button
            type="button"
            variant={armed ? 'destructive' : 'outline'}
            className={cn(armed && 'hover:bg-[color-mix(in_srgb,var(--critical)_88%,black)]')}
            disabled={busy}
            onBlur={() => setArmed(false)}
            onClick={() => {
              if (!armed) {
                setArmed(true)
                return
              }
              setBusy(true)
              void onRestart().catch((error_: unknown) => {
                setBusy(false)
                setArmed(false)
                setError(String(error_).replace(/^Error: /, ''))
              })
            }}
          >
            {/* The label cross-fades in place as it arms. */}
            <span key={label} className="animate-in fade-in duration-120 ease-out">
              {label}
            </span>
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Writes straight into settings.json; a new workspace reads it when it is made. */
export function SettingsView({
  chats,
  onRestartHost,
  terminals,
}: {
  onRestartHost: () => Promise<void>
  /** Chats in a turn, which restarting the background process would pause. */
  chats: number
  /** Terminals that restarting the background process would close. */
  terminals: number
}) {
  const [stored, setStored] = useState<Stored | null>(null)
  const [path, setPath] = useState('settings.json')
  const [error, setError] = useState<string | null>(null)
  const page = useRef<HTMLDivElement>(null)

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
      .then(() => {
        noteLoaderSetting(id, value)
        setStored((state) => {
          const next = { ...state }
          if (value === null) delete next[id]
          else next[id] = value
          return next
        })
      })
      .catch((error_: unknown) => setError(String(error_)))
  }

  // One column of headed groups: a section nav waits until there are a few to move between.
  return (
    <div ref={page} className="min-w-0 flex-1 overflow-auto px-9 pt-7 pb-12">
      <div className="mx-auto flex max-w-[720px] flex-col">
        {SECTIONS.map((section) => (
          <section key={section.id} className="not-first:mt-7">
            <h2 className={groupTitle}>{section.label}</h2>
            {stored && (
              <div className={rowsClass}>
                {section.rows.map((row) => {
                  const value = effectiveValue(row, stored[row.id])
                  const reset = resetShown(stored[row.id], row.fallback, value)
                  const control = (
                    <Control
                      row={row}
                      value={value}
                      onChange={(v) => {
                        write(row.id, v)
                        // Picking an effect (again) shows it, over this page.
                        if (row.id === 'ui.cleanupEffect')
                          void previewCleanup(String(v), page.current)
                      }}
                    />
                  )
                  // A grid of choices takes the row's width, under its label.
                  const wide = row.kind === 'select' && row.preview === 'loader'
                  return (
                    <div className={cn(rowClass, wide && 'flex-wrap gap-y-3')} key={row.id}>
                      <div className={rowText}>
                        <span className="flex items-center gap-2 font-medium">{row.label}</span>
                        <span className={rowHelp}>{row.help}</span>
                      </div>
                      <div className={rowControl}>
                        {/* A fixed slot before the control, so every control ends on one edge. */}
                        <button
                          type="button"
                          className={cn(
                            'text-faint hover:text-foreground w-10 text-right text-xs transition-opacity duration-120 ease-out focus-visible:opacity-100 disabled:invisible',
                            reset === 'hover' &&
                              'opacity-0 group-has-focus-visible/row:opacity-100 group-hover/row:opacity-100'
                          )}
                          aria-label={`Reset ${row.label}`}
                          disabled={reset === 'never'}
                          onClick={() => write(row.id, null)}
                        >
                          Reset
                        </button>
                        {!wide && control}
                      </div>
                      {wide && <div className="basis-full">{control}</div>}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        ))}
        {error !== null && <div className={cn(fieldError, 'mt-2 px-1')}>{error}</div>}
        <p className="text-faint m-0 mt-2 px-1 text-xs">
          Saved in <span className="font-mono text-xs wrap-anywhere">{path}</span>.
        </p>
        <section className="mt-7">
          <h2 className={groupTitle}>Background process</h2>
          <RestartHost chats={chats} terminals={terminals} onRestart={onRestartHost} />
        </section>
      </div>
    </div>
  )
}
