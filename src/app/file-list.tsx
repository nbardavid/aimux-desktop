import { useState } from 'react'

import type { FileChange } from './use-git'

import { Icon } from './icons'

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
    <div className={selected ? 'file is-active' : 'file'} onMouseLeave={() => setArmed(false)}>
      <button type="button" className="file-main" onClick={() => onOpen(file)}>
        <span className={`letter letter-${file.status.toLowerCase()}`}>{file.status}</span>
        <span className="fpath">
          {dir !== '' && <span className="fdir">{dir}/</span>}
          <span className="fname">{name}</span>
        </span>
        <span className="nums">
          {file.add === null ? (
            <span className="faint">binary</span>
          ) : (
            <>
              {file.add > 0 && <span className="add">+{file.add}</span>}
              {file.del !== null && file.del > 0 && <span className="del">−{file.del}</span>}
            </>
          )}
        </span>
      </button>
      {actions && (
        <span className="file-acts">
          {side !== 'staged' && (
            <button
              type="button"
              className={armed ? 'file-act is-armed' : 'file-act'}
              aria-label={armed ? `Discard ${name}: click again` : `Discard changes to ${name}`}
              data-tip={armed ? 'Click again to discard' : 'Discard'}
              onClick={() => {
                if (!armed) setArmed(true)
                else actions.discard(file)
              }}
            >
              <Icon name="undo" small />
            </button>
          )}
          {side === 'staged' ? (
            <button
              type="button"
              className="file-act"
              aria-label={`Unstage ${name}`}
              data-tip="Unstage"
              onClick={() => actions.unstage([file.path])}
            >
              <Icon name="minus" small />
            </button>
          ) : (
            <button
              type="button"
              className="file-act"
              aria-label={`Stage ${name}`}
              data-tip="Stage"
              onClick={() => actions.stage([file.path])}
            >
              <Icon name="plus" small />
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
    <div className="git-group">
      <div className="git-section">
        <span className="grow">
          {label} <span className="count">{files.length}</span>
        </span>
        {actions && (
          <button
            type="button"
            className="section-act"
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
  if (props.changes.length === 0) return <div className="quiet">Working tree clean</div>
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
