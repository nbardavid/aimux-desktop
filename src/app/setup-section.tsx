import { ChevronRightIcon } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import type { Workspace } from '../model/catalog'
import type { SetupStatus } from './use-setup'

import { dotClass } from './status-dot'

interface Props {
  status: SetupStatus | null
  workspace: Workspace
  onEdit: () => void
  onRun: () => void
  onAgent: () => void
}

function lastRun(run: Workspace['setup']) {
  if (!run) return { dot: 'idle', text: 'Not run' } as const
  if (run.exitCode === 0) return { dot: 'done', text: 'Ran fine' } as const
  return { dot: 'failing', text: `Exit ${run.exitCode ?? '?'}` } as const
}

/** `.empty-box .btn`: the box's soft buttons, a size down. */
const boxBtn = 'h-7 text-[12.5px]'

/** The TUI's setup widget: what a fresh worktree lacks, installed by one script per project. */
export function SetupSection({ onAgent, onEdit, onRun, status, workspace }: Props) {
  const [open, setOpen] = useState(false)
  if (status === null) return null
  const run = lastRun(workspace.setup)
  return (
    <div className="flex flex-none flex-col border-t">
      <button
        type="button"
        className="group/setup flex h-[38px] w-full items-center gap-2 pr-3 pl-2.5"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span
          className={cn(
            'text-label grid transition-transform duration-150 ease-[cubic-bezier(0.2,0,0,1)]',
            open && 'rotate-90'
          )}
        >
          <ChevronRightIcon className="size-3.5" />
        </span>
        <span
          className={cn(
            'text-faint group-hover/setup:text-foreground relative flex h-full items-center font-medium',
            open &&
              'text-foreground after:bg-tan after:absolute after:-inset-x-1 after:bottom-0 after:h-0.5 after:rounded-t-[2px]'
          )}
        >
          Setup
        </span>
        <span className="min-w-0 flex-1" />
        {status.exists ? (
          <span className="text-muted-foreground inline-flex items-center gap-1.5 text-[12px] font-medium">
            <span className={dotClass(run.dot)} />
            {run.text}
          </span>
        ) : (
          <span className="text-faint">No script</span>
        )}
      </button>
      {open && (
        <div className="px-3 pt-1 pb-3.5">
          <div className="border-line-strong text-muted-foreground flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-[18px] text-center text-[12.5px] leading-normal">
            <span>
              {status.exists
                ? `Runs in each new workspace of this project. This one: ${workspace.name}.`
                : 'A setup script installs what a fresh worktree lacks: dependencies, .env, caches.'}
            </span>
            <span className="flex flex-wrap justify-center gap-1.5">
              {status.exists && (
                <Button type="button" variant="secondary" className={boxBtn} onClick={onRun}>
                  Run
                </Button>
              )}
              <Button type="button" variant="secondary" className={boxBtn} onClick={onEdit}>
                {status.exists ? 'Edit' : 'Create script'}
              </Button>
              <Button type="button" variant="secondary" className={boxBtn} onClick={onAgent}>
                Write it with a chat
              </Button>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
