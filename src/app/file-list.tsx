import { MinusIcon, PlusIcon, UndoIcon } from 'lucide-react'
import { useState } from 'react'

import { cn } from '@/lib/utils'

import type { FileChange } from './use-git'

/** What the list can do to the working tree; without it, the list only shows. */
export interface FileActions {
  stage: (files: string[] | 'all') => void
  unstage: (files: string[] | 'all') => void
  discard: (file: FileChange) => void
}

interface Props {
  changes: FileChange[]
  selected?: string
  onOpen: (file: FileChange) => void
  actions?: FileActions
}

function split(path: string) {
  const cut = path.lastIndexOf('/')
  return { dir: path.slice(0, Math.max(cut, 0)), name: path.slice(cut + 1) }
}

type Side = 'staged' | 'changes' | 'untracked'

const LETTER: Record<string, string> = {
  A: 'text-good',
  D: 'text-critical',
  M: 'text-[#9a7614]',
  R: 'text-[#9a7614]',
}

const act = 'grid size-[22px] place-items-center rounded-md hover:shadow-[0_0_0_1px_var(--border)]'
const actIdle = 'text-faint hover:bg-background hover:text-foreground'
export const countClass = 'text-faint font-mono text-[11.5px] tabular-nums'

function Row({
  actions,
  file,
  onOpen,
  selected,
  side,
}: {
  file: FileChange
  side: Side
  selected: boolean
  onOpen: (file: FileChange) => void
  actions?: FileActions
}) {
  // Discarding asks twice, as the TUI does: the first click arms, the second throws away.
  const [armed, setArmed] = useState(false)
  const { dir, name } = split(file.path)
  return (
    <div
      className={cn(
        'group/file flex h-[30px] w-full items-center rounded-lg pr-1 pl-2.5',
        selected ? 'bg-pill' : 'hover:bg-hover'
      )}
      onMouseLeave={() => setArmed(false)}
    >
      <button
        type="button"
        className="flex h-full min-w-0 flex-1 items-center gap-2.5"
        onClick={() => onOpen(file)}
      >
        <span
          className={cn(
            'w-2.5 flex-none font-mono text-[10.5px] font-semibold',
            LETTER[file.status]
          )}
        >
          {file.status}
        </span>
        <span className="flex min-w-0 flex-1 items-baseline font-mono text-[12.5px]">
          {dir !== '' && <span className="text-faint min-w-0 truncate">{dir}/</span>}
          <span className="max-w-full flex-none truncate">{name}</span>
        </span>
        <span className="flex gap-[5px] font-mono text-[10.5px] whitespace-nowrap">
          {file.add === null ? (
            <span className="text-faint">binary</span>
          ) : (
            <>
              {file.add > 0 && <span className="text-good">+{file.add}</span>}
              {file.del !== null && file.del > 0 && (
                <span className="text-critical">−{file.del}</span>
              )}
            </>
          )}
        </span>
      </button>
      {actions && (
        <span className="ml-1.5 hidden flex-none gap-0.5 group-focus-within/file:flex group-hover/file:flex">
          {side !== 'staged' && (
            <button
              type="button"
              className={cn(act, armed ? 'bg-critical text-white' : actIdle)}
              aria-label={armed ? `Discard ${name}: click again` : `Discard changes to ${name}`}
              data-tip={armed ? 'Click again to discard' : 'Discard'}
              onClick={() => {
                if (!armed) setArmed(true)
                else actions.discard(file)
              }}
            >
              <UndoIcon className="size-3.5" />
            </button>
          )}
          {side === 'staged' ? (
            <button
              type="button"
              className={cn(act, actIdle)}
              aria-label={`Unstage ${name}`}
              data-tip="Unstage"
              onClick={() => actions.unstage([file.path])}
            >
              <MinusIcon className="size-3.5" />
            </button>
          ) : (
            <button
              type="button"
              className={cn(act, actIdle)}
              aria-label={`Stage ${name}`}
              data-tip="Stage"
              onClick={() => actions.stage([file.path])}
            >
              <PlusIcon className="size-3.5" />
            </button>
          )}
        </span>
      )}
    </div>
  )
}

function Section({
  actions,
  files,
  label,
  onOpen,
  selected,
  side,
}: Omit<Props, 'changes'> & { label: string; files: FileChange[]; side: Side }) {
  if (files.length === 0) return null
  const all = side === 'staged' ? 'Unstage all' : 'Stage all'
  return (
    <div className="group/section">
      <div className="text-label flex h-7 items-center gap-1.5 px-2.5 text-[12px] font-medium">
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          {label} <span className={countClass}>{files.length}</span>
        </span>
        {actions && (
          <button
            type="button"
            className="text-faint hover:text-foreground text-[11.5px] opacity-0 transition-opacity duration-120 group-hover/section:opacity-100 focus-visible:opacity-100"
            onClick={() =>
              side === 'staged' ? actions.unstage('all') : actions.stage(files.map((f) => f.path))
            }
          >
            {all}
          </button>
        )}
      </div>
      {files.map((file) => (
        <Row
          key={`${side}:${file.path}`}
          file={file}
          side={side}
          selected={file.path === selected}
          onOpen={onOpen}
          actions={actions}
        />
      ))}
    </div>
  )
}

/** Staged, then changes, then untracked files, as the TUI's git mode lists them. */
export function FileList(props: Props) {
  if (props.changes.length === 0)
    return <div className="text-faint px-3 py-8 text-center">Working tree clean</div>
  const { changes, ...rest } = props
  return (
    <>
      <Section {...rest} side="staged" label="Staged" files={changes.filter((f) => f.staged)} />
      <Section
        {...rest}
        side="changes"
        label="Changes"
        files={changes.filter((f) => !f.untracked && f.unstaged)}
      />
      <Section
        {...rest}
        side="untracked"
        label="Untracked"
        files={changes.filter((f) => f.untracked)}
      />
    </>
  )
}
