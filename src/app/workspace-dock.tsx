// The foot of the right panel: the workspace's Setup, its Run, and quick terminals, each with
// its terminal inside the dock (never in the main tabs). Run starts the project's run command
// in one click, from the bar even while the dock is shut.
import { ChevronRightIcon, PlayIcon, PlusIcon, SquareIcon, XIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

import type { Workspace } from '../model/catalog'
import type { SetupStatus } from './use-setup'
import type { TerminalTab } from './use-terminals'

import { Dot } from './status-dot'
import { TerminalView } from './terminal-view'

/** The terminals the dock owns, by tag: the main tab bar leaves them out. */
export const DOCK_TAGS: ReadonlySet<string> = new Set(['setup', 'run', 'dock'])

type Pane = 'setup' | 'run' | (string & {})

interface Props {
  workspace: Workspace
  projectName: string
  setup: SetupStatus | null
  /** The project's run command: '' when none is set, null while it loads. */
  runCommand: string | null
  /** The workspace's dock terminals, oldest first. */
  terms: TerminalTab[]
  attach: (tabId: string, el: HTMLElement, focus?: boolean) => () => void
  onSetupRun: () => void
  onSetupEdit: () => void
  onSetupAgent: () => void
  onSaveRunCommand: (command: string) => void
  onRun: () => void
  onStop: () => void
  onNewTerminal: () => void
  onCloseTerminal: (id: string) => void
}

function setupState(run: Workspace['setup'], running: boolean) {
  if (running) return { dot: 'working', said: 'running', text: 'Running…' } as const
  if (!run) return { dot: 'idle', said: 'never', text: 'Not run' } as const
  if (run.exitCode === 0) return { dot: 'done', said: 'ran fine', text: 'Ran fine' } as const
  const exit = `Exit ${run.exitCode ?? '?'}`
  return { dot: 'failing', said: exit.toLowerCase(), text: exit } as const
}

const TAB =
  "relative flex h-full flex-none items-center gap-1.5 px-2 text-sm whitespace-nowrap transition-colors duration-120 ease-out after:absolute after:right-2 after:bottom-0 after:left-2 after:h-0.5 after:rounded-t-[1px] after:bg-tan after:transition-[scale] after:duration-220 after:ease-[cubic-bezier(0.2,0,0,1)] after:content-['']"

export function WorkspaceDock(props: Props) {
  const { runCommand, setup, terms, workspace } = props
  const [open, setOpen] = useState(false)
  const [pane, setPane] = useState<Pane>('setup')
  // The terminal takes the keyboard only when the user picked it, never when a run shows itself.
  const [picked, setPicked] = useState(false)
  const setupTerm = terms.findLast((t) => t.tag === 'setup')
  const runTerm = terms.findLast((t) => t.tag === 'run')
  const quick = terms.filter((t) => t.tag === 'dock')
  const running = runTerm !== undefined && runTerm.exited === undefined

  // A setup or a run that starts shows itself; a terminal opened here too.
  const seen = useRef(new Set(terms.map((t) => t.id)))
  useEffect(() => {
    for (const t of terms) {
      if (seen.current.has(t.id)) continue
      seen.current.add(t.id)
      setPane(t.tag === 'dock' ? t.id : (t.tag as Pane))
      setOpen(true)
      setPicked(t.tag === 'dock')
    }
  }, [terms])
  // A closed terminal's pane falls back to Run.
  const shown: Pane =
    pane === 'setup' || pane === 'run' || quick.some((t) => t.id === pane) ? pane : 'run'

  const show = (next: Pane) => {
    setPicked(true)
    if (open && shown === next) return
    setPane(next)
    setOpen(true)
  }

  const s = setupState(workspace.setup, setupTerm !== undefined && setupTerm.exited === undefined)
  const hasCommand = runCommand !== null && runCommand !== ''
  let term: TerminalTab | undefined
  if (shown === 'setup') term = setupTerm
  else if (shown === 'run') term = runTerm
  else term = quick.find((t) => t.id === shown)

  return (
    <div className="flex flex-none flex-col border-t">
      <div className="h-bar flex items-stretch pr-2">
        <button
          type="button"
          className="text-faint hover:text-foreground flex w-8 flex-none items-center justify-center transition-colors duration-120"
          aria-label={open ? 'Hide the dock' : 'Show the dock'}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <ChevronRightIcon
            className={cn(
              'size-3.5 transition-transform duration-180 ease-in-out motion-reduce:transition-none',
              open && 'rotate-90'
            )}
          />
        </button>
        <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
          <DockTab label="Setup" on={open && shown === 'setup'} onClick={() => show('setup')}>
            {setup?.exists === true && <Dot tone={s.dot} />}
          </DockTab>
          <DockTab label="Run" on={open && shown === 'run'} onClick={() => show('run')}>
            {running && <Dot tone="working" />}
          </DockTab>
          {quick.map((t, i) => (
            <DockTab
              key={t.id}
              label={`Terminal ${i + 1}`}
              on={open && shown === t.id}
              onClick={() => show(t.id)}
              onClose={() => props.onCloseTerminal(t.id)}
            />
          ))}
          <button
            type="button"
            className="text-faint hover:text-foreground flex w-7 flex-none items-center justify-center transition-colors duration-120"
            aria-label="New terminal"
            data-tip="New terminal"
            data-tip-side="top"
            onClick={props.onNewTerminal}
          >
            <PlusIcon className="size-3.5" />
          </button>
        </div>
        <span className="flex flex-none items-center">
          {running ? (
            <Button type="button" variant="outline" size="xs" onClick={props.onStop}>
              <SquareIcon className="size-2.5 fill-current" />
              Stop
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => (hasCommand ? props.onRun() : show('run'))}
              data-tip={hasCommand ? runCommand : 'Set the command that starts the app'}
              data-tip-side="top"
              data-tip-align="end"
            >
              <PlayIcon className="size-3 fill-current" />
              Run
            </Button>
          )}
        </span>
      </div>
      {/* Opens by its height (grid rows 0fr → 1fr), so nothing jumps; inert while shut. */}
      <div
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-180 ease-in-out motion-reduce:transition-[opacity]',
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        )}
        inert={!open}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="flex h-[280px] flex-col border-t">
            {open && term ? (
              <TerminalView
                key={term.id}
                tabId={term.id}
                attach={props.attach}
                focus={picked}
                className="px-3 pt-2 pb-2"
              />
            ) : (
              <Empty>
                {shown === 'setup' && (
                  <SetupEmpty {...props} exists={setup?.exists === true} said={s.said} />
                )}
                {shown === 'run' && (
                  <RunEmpty
                    command={runCommand}
                    onSave={props.onSaveRunCommand}
                    onRun={props.onRun}
                  />
                )}
              </Empty>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function DockTab({
  children,
  label,
  on,
  onClick,
  onClose,
}: {
  label: string
  on: boolean
  onClick: () => void
  onClose?: () => void
  children?: React.ReactNode
}) {
  return (
    <span className="group/tab relative flex flex-none items-stretch">
      <button
        type="button"
        className={cn(
          TAB,
          on
            ? 'text-foreground after:scale-x-100'
            : 'text-faint hover:text-muted-foreground after:scale-x-0',
          onClose && 'pr-5'
        )}
        onClick={onClick}
      >
        {label}
        {children}
      </button>
      {onClose && (
        <button
          type="button"
          aria-label={`Close ${label}`}
          className="text-faint hover:text-foreground absolute top-1/2 right-0.5 flex size-4 -translate-y-1/2 items-center justify-center rounded-sm opacity-0 transition-opacity duration-120 group-hover/tab:opacity-100 focus-visible:opacity-100"
          onClick={onClose}
        >
          <XIcon className="size-3" />
        </button>
      )}
    </span>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <div className="text-muted-foreground flex max-w-[280px] flex-col items-center gap-3 text-center text-xs">
        {children}
      </div>
    </div>
  )
}

function SetupEmpty(props: Props & { exists: boolean; said: string }) {
  return (
    <>
      <span>
        {props.exists
          ? `Runs by itself in every new workspace of ${props.projectName}. Last run here: ${props.said}.`
          : 'A setup script installs what a fresh worktree lacks: dependencies, .env, caches.'}
      </span>
      <span className="flex flex-wrap justify-center gap-1.5">
        {props.exists && (
          <Button type="button" variant="secondary" size="sm" onClick={props.onSetupRun}>
            Run setup
          </Button>
        )}
        <Button type="button" variant="secondary" size="sm" onClick={props.onSetupEdit}>
          {props.exists ? 'Edit' : 'Create script'}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={props.onSetupAgent}>
          Write it with a chat
        </Button>
      </span>
    </>
  )
}

function RunEmpty({
  command,
  onRun,
  onSave,
}: {
  command: string | null
  onSave: (command: string) => void
  onRun: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(command ?? '')
  useEffect(() => setDraft(command ?? ''), [command])
  if (command === null) return null
  if (command !== '' && !editing) {
    return (
      <>
        <code className="bg-chrome text-foreground max-w-full truncate rounded-md px-2 py-1 font-mono text-[12px]">
          {command}
        </code>
        <span className="flex gap-1.5">
          <Button type="button" size="sm" onClick={onRun}>
            <PlayIcon className="size-3 fill-current" />
            Run
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(true)}>
            Edit command
          </Button>
        </span>
      </>
    )
  }
  return (
    <form
      className="flex w-[260px] flex-col items-stretch gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        onSave(draft)
        setEditing(false)
      }}
    >
      <span>The command that starts the app, in every workspace of this project.</span>
      <Input
        autoFocus
        value={draft}
        placeholder="bun run dev"
        className="font-mono text-[12px]"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return
          e.stopPropagation()
          setDraft(command)
          setEditing(false)
        }}
      />
      <span className="text-faint">Enter saves it. Esc cancels.</span>
    </form>
  )
}
