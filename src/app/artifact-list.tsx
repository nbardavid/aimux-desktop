// Every artifact of the workspace, in the page's place: the page steps aside for the choice
// rather than hiding under a floating menu (a native page draws above any menu).
import { CheckIcon, SearchIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

import { type Artifact, isNew } from '../model/catalog'
import { matchArtifacts } from './browser-tabs'
import { ageLabel } from './sidebar'
import { Dot } from './status-dot'

export function ArtifactList({
  chatOf,
  current,
  list,
  onCancel,
  onPick,
}: {
  list: Artifact[]
  /** The page that was on screen: checked, and where Esc goes back to. */
  current: string
  chatOf: (a: Artifact) => string
  onPick: (url: string) => void
  onCancel: () => void
}) {
  const [query, setQuery] = useState('')
  const shown = matchArtifacts(list, query, chatOf)
  const [active, setActive] = useState(() =>
    Math.max(
      0,
      shown.findIndex((a) => a.url === current)
    )
  )
  const rows = useRef<HTMLDivElement>(null)
  const now = Date.now()

  // The highlighted row stays in view as the arrows move it.
  useEffect(() => {
    rows.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = { ArrowDown: 1, ArrowUp: -1 }[e.key]
    if (step !== undefined) {
      e.preventDefault()
      setActive((i) => Math.min(shown.length - 1, Math.max(0, i + step)))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const pick = shown[active]
      if (pick) onPick(pick.url)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }

  return (
    <div className="animate-in fade-in slide-in-from-top-[6px] flex min-h-0 flex-1 flex-col duration-160 ease-out">
      <div className="text-faint flex h-[38px] flex-none items-center gap-2 border-b px-3">
        <SearchIcon className="size-3.5 flex-none" />
        <input
          // oxlint-disable-next-line jsx-a11y/no-autofocus -- opened by a click to search at once
          autoFocus
          aria-label="Find an artifact"
          placeholder="Find an artifact"
          className="text-foreground min-w-0 flex-1 bg-transparent text-sm outline-none select-text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      <div
        ref={rows}
        role="listbox"
        aria-label="Artifacts"
        className="min-h-0 flex-1 overflow-y-auto p-1"
      >
        {shown.map((a, i) => {
          const hint = [chatOf(a), ageLabel(a.at, now)].filter((part) => part !== '').join(' · ')
          return (
            <button
              type="button"
              role="option"
              aria-selected={a.url === current}
              key={a.url}
              className={cn(
                'relative flex h-8 w-full items-center gap-2 rounded-md pr-8 pl-2.5 text-left text-sm',
                i === active && 'bg-accent'
              )}
              onPointerMove={() => setActive(i)}
              onClick={() => onPick(a.url)}
            >
              {isNew(a) && a.url !== current && <Dot tone="done" label="New" />}
              <span className="max-w-[75%] min-w-0 flex-none truncate font-medium">
                {a.title || 'Artifact'}
              </span>
              <span className="text-faint min-w-0 flex-1 truncate text-xs">{hint}</span>
              {a.url === current && <CheckIcon className="absolute right-2.5 size-3.5" />}
            </button>
          )
        })}
        {shown.length === 0 && (
          <div className="text-faint flex h-12 items-center px-2.5 text-sm">
            No match for “{query.trim()}”
          </div>
        )}
      </div>
    </div>
  )
}
