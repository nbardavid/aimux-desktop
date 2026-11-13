import { getVersion } from '@tauri-apps/api/app'
import { invoke } from '@tauri-apps/api/core'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { openUrl } from '@tauri-apps/plugin-opener'
import { ArrowUpRightIcon, CopyIcon, PlayIcon, RotateCcwIcon } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

import {
  changedRows,
  effectiveValue,
  type Row,
  rowById,
  type Section,
  SECTIONS,
  type SettingValue,
} from '../settings/schema'
import { playSettingsSound } from './attention'
import { previewCleanup } from './cleanup-effect'
import { noteLoaderSetting } from './loader-choice'
import {
  BackgroundTiles,
  LoaderPicker,
  Segmented,
  SelectMenu,
  Slider,
  Stepper,
  Switch,
  TextField,
} from './settings-controls'
import { currentPane, PANES, setPane, stepPane, usePane } from './settings-pane'
import { DEFAULT_FONT, noteTerminalSetting } from './terminal-font'
import { devBuild, type Update } from './update-button'
import { noteWallpaperSetting, pictureUrl, useWallpaperState } from './wallpaper'
import {
  WALLPAPER_BLUR_SETTING,
  WALLPAPER_IMAGE_SETTING,
  WALLPAPER_SETTING,
  WALLPAPERS,
} from './wallpapers'

const PICTURE_TYPES = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'bmp', 'tif', 'tiff']

type Stored = Record<string, SettingValue>

/** A group: its label over a card of rows. */
const groupTitle = 'text-label mb-2 px-1 text-xs font-medium'
const cardClass = 'bg-background divide-y overflow-hidden rounded-lg border'
const rowClass = 'flex min-h-11 items-center justify-between gap-6 px-4 py-2.5'
const rowHelp = 'text-muted-foreground text-xs'
/** Under a card: what the whole group means, said once. */
const groupFoot = 'text-faint mt-2 px-1 text-xs'
const fieldError = 'text-critical-ink text-xs wrap-anywhere'

const count = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

/** What the second click says it will do, as the restart bar says it. */
export function restartWarning(chats: number, terminals: number): string {
  const clauses = [
    chats > 0 && `pauses ${count(chats, 'working chat')}`,
    terminals > 0 && `closes ${count(terminals, 'terminal')}`,
  ].filter(Boolean)
  return clauses.length === 0 ? 'Click again to restart' : `Click again: ${clauses.join(', ')}`
}

/** What Restore defaults says: once at rest, then what the second click resets. */
export function restoreLabel(changed: number, armed: boolean): string {
  if (!armed) return 'Restore defaults'
  return `Restore ${count(changed, 'setting')}?`
}

/** What Settings › About says under the version, and whether it says it as an error. */
export function updateStatus(update: Update, dev: boolean): { text: string; failed: boolean } {
  if (dev) return { failed: false, text: 'This dev build never updates itself.' }
  if (update.installing)
    return { failed: false, text: 'Downloading; the window restarts when done.' }
  if (update.error !== null) return { failed: true, text: update.error }
  if (update.version !== null)
    return {
      failed: false,
      text: `${update.version} is out. Updating restarts the window; chats and terminals keep running.`,
    }
  if (update.checking) return { failed: false, text: 'Checking for updates…' }
  if (update.checkError !== null) return { failed: true, text: update.checkError }
  if (update.checkedAt !== null) return { failed: false, text: 'Up to date.' }
  return {
    failed: false,
    text: 'Checks at launch, when you come back to the window, and every hour.',
  }
}

/** A label and its one line of help, left of a control. */
function Label({ help, label }: { label: ReactNode; help?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-sm">{label}</span>
      {help !== undefined && <span className={rowHelp}>{help}</span>}
    </div>
  )
}

/** Slides a row open or shut on its height, so the card grows instead of jumping. */
function Reveal({ children, open }: { open: boolean; children: ReactNode }) {
  return (
    <div
      className={cn(
        'grid transition-[grid-template-rows,opacity] duration-180 ease-in-out motion-reduce:transition-[opacity]',
        open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr] opacity-0'
      )}
      inert={!open}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  )
}

/** Asks for a picture and returns it read and scaled, or null when the dialog was dismissed. */
async function choosePicture(): Promise<string | null> {
  const path = await openDialog({
    filters: [{ extensions: PICTURE_TYPES, name: 'Pictures' }],
    title: 'Choose a chat background',
  })
  if (typeof path !== 'string') return null
  const bytes = await invoke<ArrayBuffer>('read_picture', { path })
  return pictureUrl(new Blob([bytes]))
}

/** Appearance › Background: the tiles, the picked picture's actions, and the blur. */
function Background({
  stored,
  write,
}: {
  stored: Stored
  write: (id: string, value: SettingValue | null) => void
}) {
  const { image } = useWallpaperState()
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const name = String(effectiveValue(rowById(WALLPAPER_SETTING), stored[WALLPAPER_SETTING]))
  const blurRow = rowById(WALLPAPER_BLUR_SETTING)
  const blur = Number(effectiveValue(blurRow, stored[WALLPAPER_BLUR_SETTING]))

  const add = async () => {
    setError(null)
    setAdding(true)
    try {
      const url = await choosePicture()
      if (url === null) return
      write(WALLPAPER_IMAGE_SETTING, url)
      write(WALLPAPER_SETTING, 'Image')
    } catch {
      setError("Couldn't read that file. Try a PNG, JPEG, HEIC or WebP.")
    } finally {
      setAdding(false)
    }
  }

  // No divide-y: the rows below slide in with their own top line.
  return (
    <div className="bg-background overflow-hidden rounded-lg border">
      <div className="flex flex-col gap-3 px-4 pt-4 pb-3.5">
        <BackgroundTiles
          options={[...WALLPAPERS]}
          value={name}
          image={image}
          adding={adding}
          onAdd={() => void add()}
          onChange={(v) => {
            setError(null)
            write(WALLPAPER_SETTING, v)
          }}
        />
        {error !== null && <span className={cn(fieldError, 'animate-in fade-in')}>{error}</span>}
      </div>
      <Reveal open={name === 'Image' && image !== ''}>
        <div className={cn(rowClass, 'border-t')}>
          <Label label="Your image" />
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                write(WALLPAPER_SETTING, null)
                write(WALLPAPER_IMAGE_SETTING, null)
              }}
            >
              Remove
            </Button>
            <Button variant="outline" size="sm" disabled={adding} onClick={() => void add()}>
              Replace…
            </Button>
          </div>
        </div>
      </Reveal>
      <Reveal open={name !== 'None'}>
        <div className={cn(rowClass, 'border-t')}>
          <Label label={blurRow.label} />
          {blurRow.kind === 'number' && (
            <Slider
              label={blurRow.label}
              value={blur}
              min={blurRow.min}
              max={blurRow.max}
              step={blurRow.step}
              format={(v) => (v === 0 ? 'Off' : `${v} px`)}
              onCommit={(v) => write(blurRow.id, v)}
            />
          )}
        </div>
      </Reveal>
    </div>
  )
}

/** One setting's control, by its kind. */
function Control({
  onChange,
  row,
  stored,
  value,
}: {
  row: Row
  value: SettingValue
  stored: Stored
  onChange: (v: SettingValue) => void
}) {
  switch (row.kind) {
    case 'toggle':
      return <Switch label={row.label} checked={value === true} onChange={onChange} />
    case 'text':
      return (
        <TextField
          label={row.label}
          value={String(value)}
          placeholder={row.placeholder}
          mono={row.mono}
          onChange={onChange}
        />
      )
    case 'number': {
      const n = Number(value)
      if (row.control === 'stepper')
        return (
          <Stepper
            label={row.label}
            value={n}
            min={row.min}
            max={row.max}
            step={row.step}
            onChange={onChange}
          />
        )
      // Volume means nothing without a sound.
      const silent = row.id === 'notifications.volume' && stored['notifications.sound'] === 'Off'
      return (
        <span className="flex" data-tip={silent ? 'Pick a sound first' : undefined}>
          <Slider
            label={row.label}
            value={n}
            min={row.min}
            max={row.max}
            step={row.step}
            disabled={silent}
            format={(v) => (row.zeroOff === true && v === 0 ? 'Off' : `${v}${row.unit ?? ''}`)}
            onCommit={onChange}
          />
        </span>
      )
    }
    case 'select': {
      const props = { label: row.label, onChange, options: row.options, value: String(value) }
      if (row.control === 'segmented') return <Segmented {...props} />
      if (row.control === 'loader' || row.control === 'dots')
        return <LoaderPicker {...props} dots={row.control === 'dots'} />
      return <SelectMenu {...props} />
    }
  }
}

/** A pane made of the schema's groups. */
function SectionPane({
  page,
  section,
  stored,
  write,
}: {
  section: Section
  stored: Stored
  write: (id: string, value: SettingValue | null) => void
  page: HTMLElement | null
}) {
  const change = (row: Row, v: SettingValue) => {
    write(row.id, v)
    // Picking an effect (again) shows it, over this page.
    if (row.id === 'ui.cleanupEffect') void previewCleanup(String(v), page)
    // Picking a sound or a volume plays it.
    if (row.id.startsWith('notifications.')) playSettingsSound({ ...stored, [row.id]: v })
  }
  return (
    <>
      {section.groups.map((group) => (
        <section key={group.label}>
          <h2 className={groupTitle}>{group.label}</h2>
          {group.rows.some((r) => r.id === WALLPAPER_SETTING) ? (
            <Background stored={stored} write={write} />
          ) : (
            <div className={cardClass}>
              {group.rows.map((row) => {
                const value = effectiveValue(row, stored[row.id])
                return (
                  <div key={row.id}>
                    <div className={rowClass}>
                      <Label label={row.label} help={row.help} />
                      <div className="flex flex-none items-center gap-1.5">
                        {row.id === 'ui.cleanupEffect' && value !== 'None' && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Play the clean up effect"
                            data-tip="Play it"
                            onClick={() => void previewCleanup(String(value), page)}
                          >
                            <PlayIcon />
                          </Button>
                        )}
                        <Control
                          row={row}
                          value={value}
                          stored={stored}
                          onChange={(v) => change(row, v)}
                        />
                      </div>
                    </div>
                    {row.id === 'terminal.fontFamily' && <FontSample family={String(value)} />}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      ))}
    </>
  )
}

/** A line set in the terminal's font, under the font's row. */
function FontSample({ family }: { family: string }) {
  const named = family.trim().replaceAll('"', '')
  return (
    <div className="px-4 pb-3">
      <div
        className="bg-chrome text-muted-foreground truncate rounded-md px-3 py-2 text-[12.5px]"
        style={{ fontFamily: named === '' ? DEFAULT_FONT : `"${named}", ${DEFAULT_FONT}` }}
      >
        ~/logit <span className="text-foreground">main</span> ❯ ls -la src
      </div>
    </div>
  )
}

/** Restarting the host closes its terminals, so it asks twice; chats resume from transcripts. */
function HostPane({
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
  let label = 'Restart…'
  if (busy) label = 'Restarting…'
  else if (armed) label = restartWarning(chats, terminals)
  const running = [count(chats, 'working chat'), count(terminals, 'terminal')].join(', ')
  return (
    <section>
      <h2 className={groupTitle}>Chats and terminals</h2>
      <div className={cardClass}>
        <div className={rowClass}>
          <Label
            label="Running"
            help={error === null ? running : <span className={fieldError}>{error}</span>}
          />
          <div className="flex flex-none" onMouseLeave={() => setArmed(false)}>
            <Button
              type="button"
              size="sm"
              variant={armed ? 'destructive' : 'outline'}
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
      <p className={groupFoot}>
        They keep running when the window closes. Chats resume after a restart; terminals
        don&apos;t.
      </p>
    </section>
  )
}

/** The version and its updates, the settings file, the source. */
function AboutPane({ path, update }: { update: Update; path: string }) {
  const [version, setVersion] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    void getVersion().then(setVersion, () => {})
  }, [])
  const status = updateStatus(update, devBuild)
  let label = 'Check for updates'
  if (update.installing) label = 'Updating…'
  else if (update.version !== null) label = `Update to ${update.version}`
  else if (update.checking) label = 'Checking…'
  return (
    <section>
      <h2 className={groupTitle}>logit</h2>
      <div className={cardClass}>
        <div className={rowClass}>
          <Label
            label={version === null ? 'Version' : `Version ${version}`}
            help={
              // The line cross-fades as the state moves on.
              <span
                key={status.text}
                className={cn(
                  status.failed && 'text-critical-ink',
                  'animate-in fade-in duration-160 ease-out'
                )}
              >
                {status.text}
              </span>
            }
          />
          <Button
            type="button"
            size="sm"
            variant={update.version === null ? 'outline' : 'default'}
            disabled={devBuild || update.checking || update.installing}
            onClick={update.version === null ? update.check : update.install}
          >
            <span key={label} className="animate-in fade-in duration-120 ease-out">
              {label}
            </span>
          </Button>
        </div>
        <div className={rowClass}>
          <Label
            label="Settings file"
            help={
              <span className="block truncate font-mono" title={path}>
                {path}
              </span>
            }
          />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Copy the path"
            data-tip={copied ? 'Copied' : 'Copy the path'}
            onClick={() => {
              void navigator.clipboard.writeText(path).then(() => setCopied(true))
            }}
            onMouseLeave={() => setCopied(false)}
          >
            <CopyIcon />
          </Button>
        </div>
        <div className={rowClass}>
          <Label label="Source" />
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => void openUrl('https://github.com/nbardavid/logit').catch(() => {})}
          >
            nbardavid/logit
            <ArrowUpRightIcon />
          </Button>
        </div>
      </div>
      <p className={groupFoot}>MIT. Started from BrimVeyn/aimux.</p>
    </section>
  )
}

/** Puts a pane's settings back to their defaults; asks twice. */
function RestoreDefaults({ changed, onRestore }: { changed: number; onRestore: () => void }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (changed === 0) setArmed(false)
  }, [changed])
  return (
    <div
      className={cn(
        'flex justify-end transition-opacity duration-160 ease-out',
        changed === 0 && 'pointer-events-none opacity-0'
      )}
      aria-hidden={changed === 0}
      onMouseLeave={() => setArmed(false)}
    >
      <Button
        variant="ghost"
        size="sm"
        tabIndex={changed === 0 ? -1 : 0}
        className={cn(armed && 'text-critical-ink hover:text-critical-ink')}
        onBlur={() => setArmed(false)}
        onClick={() => {
          if (!armed) return setArmed(true)
          setArmed(false)
          onRestore()
        }}
      >
        <RotateCcwIcon />
        <span key={String(armed)} className="animate-in fade-in duration-120 ease-out">
          {restoreLabel(changed, armed)}
        </span>
      </Button>
    </div>
  )
}

/** Writes straight into settings.json; a new workspace reads it when it is made. */
export function SettingsView({
  chats,
  onClose,
  onRestartHost,
  terminals,
  update,
}: {
  onClose: () => void
  /** The app's update, which About checks and installs. */
  update: Update
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
  const pane = usePane()

  useEffect(() => {
    void invoke<{ path: string; settings: Stored }>('read_settings').then(
      (read) => {
        setPath(read.path)
        setStored(read.settings)
      },
      () => {
        setError("Couldn't load settings.json. Changes won't be saved.")
        setStored({})
      }
    )
  }, [])

  // A new pane starts at its top.
  useEffect(() => {
    page.current?.scrollTo({ top: 0 })
  }, [pane.id])

  const write = (id: string, value: SettingValue | null) => {
    invoke('write_setting', { id, value })
      .then(() => {
        noteLoaderSetting(id, value)
        noteWallpaperSetting(id, value)
        noteTerminalSetting(id, value)
        setStored((state) => {
          const next = { ...state }
          if (value === null) delete next[id]
          else next[id] = value
          return next
        })
      })
      .catch((error_: unknown) => setError(`Couldn't save: ${String(error_)}`))
  }

  const section = SECTIONS.find((s) => s.id === pane.id)
  const changed = section !== undefined && stored !== null ? changedRows(section, stored) : []

  // A window over the app, not a page: the chat stays in sight around it, so a background and
  // its blur show as they are picked.
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        overlayClassName="bg-transparent"
        className="top-1/2 h-[min(640px,calc(100%-64px))] w-[min(880px,calc(100%-48px))] -translate-y-1/2 flex-row"
      >
        <SettingsNav />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-12 flex-none items-center justify-between gap-4 pr-4 pl-8">
            <DialogTitle className="text-base">{pane.label}</DialogTitle>
            {section !== undefined && (
              <RestoreDefaults
                changed={changed.length}
                onRestore={() => {
                  for (const row of changed) write(row.id, null)
                }}
              />
            )}
          </div>
          <div ref={page} className="min-h-0 flex-1 overflow-auto px-8 pt-2 pb-8">
            {/* The pane fades in and rises a hair; the old one leaves at once. */}
            <div
              key={pane.id}
              className="animate-in fade-in slide-in-from-bottom-1 flex flex-col gap-6 duration-160 ease-out"
            >
              {error !== null && <div className={cn(fieldError, 'px-1')}>{error}</div>}
              {section !== undefined && stored !== null && (
                <SectionPane section={section} stored={stored} write={write} page={page.current} />
              )}
              {pane.id === 'host' && (
                <HostPane chats={chats} terminals={terminals} onRestart={onRestartHost} />
              )}
              {pane.id === 'about' && <AboutPane update={update} path={path} />}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** The sections, down the window's left side. ↑/↓ step through them, as ⌃Tab does. */
function SettingsNav() {
  const pane = usePane()
  return (
    <div
      className="bg-side border-border flex w-[200px] flex-none flex-col gap-0.5 border-r p-2 pt-3"
      role="tablist"
      aria-orientation="vertical"
      aria-label="Settings"
      onKeyDown={(e) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
        e.preventDefault()
        stepPane(e.key === 'ArrowDown' ? 1 : -1)
        const tabs = e.currentTarget.querySelectorAll<HTMLElement>('[role=tab]')
        tabs[PANES.findIndex((p) => p.id === currentPane())]?.focus()
      }}
    >
      <span className="text-label px-2.5 pb-2 text-xs font-medium">Settings</span>
      {PANES.map(({ icon: Icon, id, label }) => {
        const here = pane.id === id
        return (
          <button
            type="button"
            key={id}
            role="tab"
            aria-selected={here}
            tabIndex={here ? 0 : -1}
            className="hover:bg-hover text-muted-foreground aria-selected:bg-active aria-selected:text-foreground flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm whitespace-nowrap transition-[background-color,color] duration-120 outline-none"
            onClick={() => setPane(id)}
          >
            <Icon className={cn('size-4 shrink-0', here ? 'text-foreground' : 'text-faint')} />
            <span className="min-w-0 flex-1 truncate text-left">{label}</span>
          </button>
        )
      })}
    </div>
  )
}
