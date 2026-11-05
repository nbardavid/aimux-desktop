import { invoke } from '@tauri-apps/api/core'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import type { FileChange } from './use-git'

import { type DiffLine, parseUnifiedDiff } from '../git/diff'
import { countClass, FileList } from './file-list'

interface Props {
  path: string
  changes: FileChange[]
  file: FileChange | undefined
  onSelect: (file: FileChange) => void
  onExit: () => void
}

const SIGN = { add: '+', ctx: '', del: '−', hunk: '' } as const
/** The row's tint, and the colour of its sign and code. */
const LINE = {
  add: { row: 'bg-[color-mix(in_srgb,var(--good)_9%,transparent)]', text: 'text-[#2f6b3e]' },
  ctx: { row: '', text: '' },
  del: { row: 'bg-[color-mix(in_srgb,var(--critical)_8%,transparent)]', text: 'text-[#a2301f]' },
  hunk: { row: 'bg-chrome text-faint mt-2 first:mt-0', text: '' },
} as const
const bar = 'flex h-bar flex-none items-center gap-3 border-b pr-2.5 pl-[18px]'
const lineNo = 'text-faint pr-2 text-right tabular-nums'

export function GitMode({ changes, file, onExit, onSelect, path }: Props) {
  const [lines, setLines] = useState<DiffLine[]>([])
  const shown = file ?? changes[0]

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
    <div className="flex min-h-0 min-w-0 flex-1">
      <div className="bg-side flex w-[340px] flex-none flex-col border-r">
        <div className={bar}>
          <span className="flex min-w-0 flex-1 items-center gap-2 font-medium">
            Changes <span className={countClass}>{changes.length}</span>
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-2 pt-0.5 pb-3">
          <FileList changes={changes} selected={shown?.path} onOpen={onSelect} />
        </div>
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className={bar}>
          <span className="min-w-0 flex-1 truncate font-mono text-[12px] font-medium">
            {shown?.path ?? 'No changes'}
          </span>
          <Button
            type="button"
            variant="outline"
            className="h-[26px] text-[12.5px]"
            onClick={onExit}
          >
            Exit diff
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto font-mono text-[12px] leading-[1.65] select-text">
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
