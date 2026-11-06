import {
  CircleCheckIcon,
  type LucideIcon,
  MinusIcon,
  PlusIcon,
  SquareArrowRightIcon,
  SquareDotIcon,
  SquareMinusIcon,
  SquarePlusIcon,
  UndoIcon,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
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

type Side = 'staged' | 'changes'

/** Wider than its box, to the fraction of a pixel (`scrollWidth` rounds). */
const clipped = (box: Element | undefined, content: Element | null | undefined = box) =>
  box !== undefined &&
  content != null &&
  Math.max(content.scrollWidth, content.getBoundingClientRect().width) >
    box.getBoundingClientRect().width + 0.5

/**
 * A file's path in one line: the name whole, the folder before it cut from the left so the
 * nearest folders stay (`…components/ui/`), and dropped when under 3ch would be left of it.
 * The row reverses and wraps: a folder that does not fit goes to a second line, out of sight.
 * A cut folder fades out at its left edge rather than ending on an ellipsis, which in a
 * right-to-left run would leave a gap and break the column's left edge.
 */
function PathLabel({ dir, name, path }: { dir: string; name: string; path: string }) {
  const box = useRef<HTMLSpanElement>(null)
  const [cut, setCut] = useState({ any: false, folder: false })
  // The full path shows on hover only when the row does not show all of it.
  useEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => {
      const [file, folder] = [...el.children]
      const folderCut = clipped(folder, folder?.firstElementChild)
      const any =
        folderCut ||
        clipped(file) ||
        (folder instanceof HTMLElement && file instanceof HTMLElement
          ? folder.offsetTop !== file.offsetTop
          : false)
      setCut((c) => (c.any === any && c.folder === folderCut ? c : { any, folder: folderCut }))
    }
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [path])
  return (
    <Tooltip disabled={!cut.any}>
      <TooltipTrigger
        render={
          <span
            ref={box}
            className="flex h-[18px] min-w-0 flex-1 flex-row-reverse flex-wrap items-baseline justify-end overflow-hidden text-sm"
          />
        }
      >
        <span className="text-foreground min-w-0 truncate">{name}</span>
        {dir !== '' && (
          <span
            className={cn(
              'text-faint max-w-max min-w-0 flex-[1_1_3ch] overflow-hidden whitespace-nowrap [direction:rtl]',
              cut.folder && '[mask-image:linear-gradient(to_right,transparent,black_2ch)]'
            )}
          >
            <bdi>{dir}/</bdi>
          </span>
        )}
      </TooltipTrigger>
      {/* Long paths wrap after a slash, not inside a name. */}
      <TooltipContent className="max-w-[min(560px,90vw)] whitespace-normal wrap-anywhere">
        {path.replaceAll('/', '/\u200B')}
      </TooltipContent>
    </Tooltip>
  )
}

/** The 14px square at a row's far right: what happened to the file, by colour. */
const SQUARE = {
  added: { icon: SquarePlusIcon, label: 'Added', tone: 'text-good' },
  deleted: { icon: SquareMinusIcon, label: 'Deleted', tone: 'text-critical' },
  modified: { icon: SquareDotIcon, label: 'Modified', tone: 'text-warn' },
  renamed: { icon: SquareArrowRightIcon, label: 'Renamed', tone: 'text-faint' },
} as const

/** An untracked file is an added file not staged yet; anything else git says reads as modified. */
export function squareOf(file: FileChange): keyof typeof SQUARE {
  if (file.untracked || file.status === 'A') return 'added'
  if (file.status === 'D') return 'deleted'
  if (file.status === 'R' || file.status === 'C') return 'renamed'
  return 'modified'
}

/** `+n −n` (or "binary"), then the square. */
export function FileMeta({ file }: { file: FileChange }) {
  const square = SQUARE[squareOf(file)]
  return (
    <>
      {file.add === null ? (
        <span className="text-faint text-xs">binary</span>
      ) : (
        <span className="flex gap-1 font-mono text-xs whitespace-nowrap tabular-nums">
          {file.add > 0 && <span className="text-good">+{file.add}</span>}
          {file.del !== null && file.del > 0 && <span className="text-critical">−{file.del}</span>}
        </span>
      )}
      <square.icon
        className={cn('size-3.5 flex-none', square.tone)}
        role="img"
        aria-label={square.label}
      />
    </>
  )
}

/** A row action: a 24px ghost, a step darker than the hovered row under it. */
const act = 'text-faint hover:bg-active hover:text-foreground'
export const countClass = 'text-faint text-xs font-normal tabular-nums'
/** The actions sit over the counts and the square, and cross-fade with them. */
const shownOnRow =
  'group-hover/file:visible group-hover/file:opacity-100 group-focus-within/file:visible group-focus-within/file:opacity-100'
const hiddenOnRow = 'group-hover/file:opacity-0 group-focus-within/file:opacity-0'

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
        'group/file relative flex h-8 w-full items-center rounded-md transition-colors duration-120 ease-out',
        selected ? 'bg-active' : 'hover:bg-hover'
      )}
      onMouseLeave={() => setArmed(false)}
    >
      <button
        type="button"
        className="flex h-full min-w-0 flex-1 items-center gap-2 pr-2 pl-3"
        aria-current={selected || undefined}
        onClick={() => onOpen(file)}
      >
        <PathLabel dir={dir} name={name} path={file.path} />
        {/* The row's actions take this slot on hover: the row never widens. */}
        <span
          className={cn(
            'flex flex-none items-center justify-end gap-2 transition-opacity duration-120 ease-out',
            actions && cn('min-w-[50px]', hiddenOnRow)
          )}
        >
          <FileMeta file={file} />
        </span>
      </button>
      {actions && (
        <span
          className={cn(
            'invisible absolute inset-y-0 right-2 flex items-center gap-0.5 opacity-0 transition-[opacity,visibility] duration-120 ease-out',
            shownOnRow
          )}
        >
          {side !== 'staged' && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className={armed ? 'bg-critical hover:bg-critical text-white hover:text-white' : act}
              aria-label={armed ? `Discard ${name}: click again` : `Discard changes to ${name}`}
              data-tip={armed ? 'Click again to discard' : 'Discard'}
              data-tip-align="end"
              onClick={() => {
                if (!armed) setArmed(true)
                else actions.discard(file)
              }}
            >
              <UndoIcon />
            </Button>
          )}
          {side === 'staged' ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className={act}
              aria-label={`Unstage ${name}`}
              data-tip="Unstage"
              data-tip-align="end"
              onClick={() => actions.unstage([file.path])}
            >
              <MinusIcon />
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className={act}
              aria-label={`Stage ${name}`}
              data-tip="Stage"
              data-tip-align="end"
              onClick={() => actions.stage([file.path])}
            >
              <PlusIcon />
            </Button>
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
      <div className="text-label flex h-7 items-center gap-1 px-3 text-xs font-medium">
        <span className="flex min-w-0 flex-1 items-center gap-1">
          {label} <span className={countClass}>{files.length}</span>
        </span>
        {actions && (
          <button
            type="button"
            className="text-faint hover:text-foreground text-xs opacity-0 transition-[opacity,color] duration-120 ease-out group-hover/section:opacity-100 focus-visible:opacity-100"
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

/**
 * The list's two sections. Untracked files are folded into Changes, after the tracked ones:
 * a new file is an added file not staged yet. A file half staged shows in both.
 */
function sections(changes: FileChange[]) {
  return {
    changes: [
      ...changes.filter((f) => !f.untracked && f.unstaged),
      ...changes.filter((f) => f.untracked),
    ],
    staged: changes.filter((f) => f.staged),
  }
}

/** Each file once, in the order the list shows them: what ↑ and ↓ walk through. */
export function listOrder(changes: FileChange[]): FileChange[] {
  const { changes: changed, staged } = sections(changes)
  const seen = new Set<string>()
  return [...staged, ...changed].filter((f) => {
    if (seen.has(f.path)) return false
    seen.add(f.path)
    return true
  })
}

/** A quiet empty state, 96px from the top: a 20px icon and one line. */
export function Empty({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="text-faint flex flex-col items-center gap-2 px-3 pt-24 text-center">
      <Icon className="text-label size-5" />
      {text}
    </div>
  )
}

/** Staged, then changes (untracked included), as the TUI's git mode lists them. */
export function FileList(props: Props) {
  if (props.changes.length === 0) return <Empty icon={CircleCheckIcon} text="Working tree clean" />
  const { changes, ...rest } = props
  const listed = sections(changes)
  return (
    <div className="flex flex-col gap-2">
      <Section {...rest} side="staged" label="Staged" files={listed.staged} />
      <Section {...rest} side="changes" label="Changes" files={listed.changes} />
    </div>
  )
}
