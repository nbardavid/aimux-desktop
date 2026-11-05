import { invoke } from '@tauri-apps/api/core'
import { useEffect, useState } from 'react'

import type { FileChange } from './use-git'

import { type DiffLine, parseUnifiedDiff } from '../git/diff'
import { FileList } from './file-list'
import { Icon } from './icons'

interface Props {
  path: string
  branch: string | undefined
  changes: FileChange[]
  file: FileChange | undefined
  onSelect: (file: FileChange) => void
  onExit: () => void
}

const SIGN = { add: '+', ctx: '', del: '−', hunk: '' } as const

export function GitMode({ branch, changes, file, onExit, onSelect, path }: Props) {
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
    <div className="gitmode">
      <div className="gm-files">
        <div className="gm-head">
          <span className="grow">
            <Icon name="branch" small />
            {branch ?? 'detached'}
          </span>
        </div>
        <div className="git-scroll">
          <FileList changes={changes} selected={shown?.path} onOpen={onSelect} />
        </div>
      </div>
      <div className="diff">
        <div className="diff-head">
          <span className="path">{shown?.path ?? 'No changes'}</span>
          <button type="button" className="btn btn-outline" onClick={onExit}>
            Exit diff
          </button>
        </div>
        <div className="diff-body">
          {lines.map((line, i) => (
            // oxlint-disable-next-line react/no-array-index-key -- diff lines are positional
            <div key={i} className={`dl dl-${line.kind}`}>
              <span className="n">{line.a}</span>
              <span className="n">{line.b}</span>
              <span className="s">{SIGN[line.kind]}</span>
              <span className="c">{line.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
