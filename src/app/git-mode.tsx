import { invoke } from '@tauri-apps/api/core'
import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

import type { FileChange } from './use-git'

import { type DiffLine, parseUnifiedDiff } from '../git/diff'
import { countClass, FileList, FileMeta, listOrder } from './file-list'
import { stepThrough } from './navigation'

interface Props {
  path: string
  changes: FileChange[]
  file: FileChange | undefined
  onSelect: (file: FileChange) => void
}

const SIGN = { add: '+', ctx: '', del: '−', hunk: '' } as const
/** The row's tint, and the colour of its sign and code. */
const LINE = {
  add: { row: 'bg-good-wash', text: 'text-good-ink' },
  ctx: { row: '', text: '' },
  del: { row: 'bg-critical-wash', text: 'text-critical-ink' },
  hunk: { row: 'bg-chrome text-faint mt-2 first:mt-0', text: '' },
} as const
/** Both columns' bars: 40px, their text on the file rows' 20px inset. */
const bar = 'flex h-bar flex-none items-center gap-2 border-b pr-3 pl-5'
const lineNo = 'text-faint pr-2 text-right tabular-nums'

export function GitMode({ changes, file, onSelect, path }: Props) {
  const [lines, setLines] = useState<DiffLine[]>([])
  const order = listOrder(changes)
  const shown = file ?? order[0]
  const list = useRef<HTMLDivElement>(null)

  // ↑/↓ (or k/j) walk the files, wherever the focus is but in a field.
  const walk = useRef({ onSelect, order, shown })
  walk.current = { onSelect, order, shown }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const field = e.target instanceof HTMLElement && e.target.closest('input, textarea') !== null
      if (e.defaultPrevented || field || e.metaKey || e.ctrlKey || e.altKey) return
      const step = { ArrowDown: 1, ArrowUp: -1, j: 1, k: -1 }[e.key] as 1 | -1 | undefined
      if (step === undefined) return
      e.preventDefault()
      const w = walk.current
      const paths = w.order.map((f) => f.path)
      const next = w.order[paths.indexOf(stepThrough(paths, w.shown?.path, step) ?? '')]
      if (next) w.onSelect(next)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    list.current?.querySelector('[aria-current=true]')?.scrollIntoView({ block: 'nearest' })
  }, [shown?.path])

  useEffect(() => {
    if (!shown) {
      setLines([])
      return
    }
    let live = true
    void invoke<string>('git_diff', { file: shown.path, path, untracked: shown.untracked })
      .then((raw) => live && setLines(parseUnifiedDiff(raw)))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [path, shown])

  return (
    <div className="glass flex min-h-0 min-w-0 flex-1">
      <div className="bg-side flex w-[340px] flex-none flex-col border-r">
        <div className={bar}>
          <span className="flex min-w-0 flex-1 items-center gap-1 font-medium">
            Changes <span className={countClass}>{changes.length}</span>
          </span>
        </div>
        <div ref={list} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-2 pt-2 pb-3">
          <FileList changes={changes} selected={shown?.path} onOpen={onSelect} />
        </div>
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className={bar}>
          {shown ? (
            <>
              {/* The file the diff shows: its folder faint, its name in ink, as in the list. */}
              <span className="min-w-0 flex-1 truncate">
                {shown.path.includes('/') && (
                  <span className="text-faint">
                    {shown.path.slice(0, shown.path.lastIndexOf('/') + 1)}
                  </span>
                )}
                <span className="font-medium">{shown.path.split('/').pop()}</span>
              </span>
              <FileMeta file={shown} />
            </>
          ) : (
            <span className="text-faint">No changes</span>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-auto font-mono text-[12.5px] leading-5 select-text">
          {lines.map((line, i) => (
            // oxlint-disable-next-line react/no-array-index-key -- diff lines are positional
            <div
              key={i}
              className={cn(
                'grid grid-cols-[48px_48px_20px_1fr] whitespace-pre',
                LINE[line.kind].row
              )}
            >
              <span className={lineNo}>{line.a}</span>
              <span className={lineNo}>{line.b}</span>
              <span className={cn('text-faint text-center', LINE[line.kind].text)}>
                {SIGN[line.kind]}
              </span>
              <span className={LINE[line.kind].text}>{line.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
