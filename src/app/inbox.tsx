import { useMemo } from 'react'

import { Popover, PopoverContent } from '@/components/ui/popover'
import { menuGroupLabelClass } from '@/lib/menu-styles'

import type { InboxEntry } from '../model/inbox'

import { dotClass } from './status-dot'

interface Props {
  entries: InboxEntry[]
  at: { x: number; y: number }
  /** The project you are in: its name goes without saying. */
  projectId: string | null
  onOpen: (entry: InboxEntry) => void
  onClose: () => void
}

/** The agents waiting for you, wherever they are; one click takes you to the tab. */
export function Inbox({ at, entries, onClose, onOpen, projectId }: Props) {
  // Opens at a point (beside the sidebar's Inbox row); modal, so a click outside only closes it.
  const anchor = useMemo(
    () => ({ getBoundingClientRect: () => new DOMRect(at.x, at.y, 0, 0) }),
    [at.x, at.y]
  )
  return (
    <Popover open modal onOpenChange={(open) => !open && onClose()}>
      <PopoverContent
        anchor={anchor}
        sideOffset={0}
        aria-label="Inbox"
        className="max-h-[70vh] w-[360px] overflow-auto p-1"
      >
        <div className={menuGroupLabelClass}>Inbox</div>
        {entries.length === 0 && (
          <div className="text-faint px-2 pt-0.5 pb-2 text-xs">
            Nothing waits for you. Agents that ask or finish show here.
          </div>
        )}
        {entries.map((entry) => (
          <button
            type="button"
            key={entry.tabId}
            className="hover:bg-accent flex h-8 flex-none items-center gap-2 rounded-md px-2 transition-colors duration-120"
            title={`${entry.title} · ${entry.projectName} · ${entry.workspaceName}`}
            onClick={() => {
              onOpen(entry)
              onClose()
            }}
          >
            <span className={dotClass(entry.kind === 'waiting' ? 'waiting' : 'done')} />
            <span className="min-w-0 shrink truncate font-medium">{entry.title}</span>
            <span className="text-faint min-w-0 flex-1 truncate text-xs">
              {entry.projectId === projectId
                ? entry.workspaceName
                : `${entry.workspaceName} · ${entry.projectName}`}
            </span>
            <span className="text-faint flex-none text-xs">
              {entry.kind === 'waiting' ? 'Waiting for you' : 'Done'}
            </span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}
