import { ChevronRightIcon } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import type { Workspace } from '../model/catalog'
import type { SetupStatus } from './use-setup'

import { Dot } from './status-dot'

interface Props {
  status: SetupStatus | null
  workspace: Workspace
  /** The project's name: the script runs in each of its new workspaces. */
  projectName: string
  /** The workspace's last Setup tab, while it is open: running, or showing how it ended. */
  run: { running: boolean } | null
  /** Shows that tab. */
  onShowRun: () => void
  onEdit: () => void
  onRun: () => void
  onAgent: () => void
}

function lastRun(run: Workspace['setup'], running: boolean) {
  if (running) return { dot: 'working', said: 'running', text: 'Running…' } as const
  if (!run) return { dot: 'idle', said: 'never', text: 'Not run' } as const
  if (run.exitCode === 0) return { dot: 'done', said: 'ran fine', text: 'Ran fine' } as const
  const exit = `Exit ${run.exitCode ?? '?'}`
  return { dot: 'failing', said: exit.toLowerCase(), text: exit } as const
}

/**
 * The TUI's setup widget: what a fresh worktree lacks, installed by one script per project.
 * A 40px strip at the panel's foot, the same bar as Conductor's Run strip, with no Run button.
 */
export function SetupSection(props: Props) {
  const { onAgent, onEdit, onRun, status, workspace } = props
  const [open, setOpen] = useState(false)
  if (status === null) return null
  const run = lastRun(workspace.setup, props.run?.running === true)
  const said = (
    <>
      <Dot tone={run.dot} />
      {run.text}
    </>
  )
  return (
    <div className="flex flex-none flex-col border-t">
      <div className="flex h-bar items-center pr-2">
        <button
          type="button"
          className="group/setup flex h-full min-w-0 flex-1 items-center gap-2 pr-1 pl-3"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <ChevronRightIcon
            className={cn(
              'text-faint size-3.5 flex-none transition-transform duration-180 ease-in-out motion-reduce:transition-none',
              open && 'rotate-90'
            )}
          />
          <span
            className={cn(
              'group-hover/setup:text-foreground transition-colors duration-120 ease-out',
              open ? 'text-foreground' : 'text-muted-foreground'
            )}
          >
            Setup
          </span>
          <span className="min-w-0 flex-1" />
          {!status.exists && <span className="text-faint text-xs">No script</span>}
          {status.exists && props.run === null && (
            <span className="text-faint inline-flex items-center gap-1.5 text-xs">{said}</span>
          )}
        </button>
        {/* With its tab still open, the status takes you to it. */}
        {status.exists && props.run !== null && (
          <button
            type="button"
            className="text-faint hover:bg-hover hover:text-foreground inline-flex h-7 items-center gap-1.5 rounded-md px-1.5 text-xs transition-colors duration-120 ease-out"
            data-tip="Show the Setup tab"
            data-tip-side="top"
            data-tip-align="end"
            onClick={props.onShowRun}
          >
            {said}
          </button>
        )}
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
          <div className="text-muted-foreground flex flex-col gap-3 px-3 pt-1 pb-3 text-xs">
            <span>
              {status.exists
                ? `Runs in every new workspace of ${props.projectName}. Last run here: ${run.said}.`
                : 'A setup script installs what a fresh worktree lacks: dependencies, .env, caches.'}
            </span>
            <span className="flex flex-wrap gap-1.5">
              {status.exists && (
                <Button type="button" variant="secondary" size="sm" onClick={onRun}>
                  Run
                </Button>
              )}
              <Button type="button" variant="secondary" size="sm" onClick={onEdit}>
                {status.exists ? 'Edit' : 'Create script'}
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={onAgent}>
                Write it with a chat
              </Button>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
