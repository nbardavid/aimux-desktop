import { useMemo } from 'react'

import { Popover, PopoverContent } from '@/components/ui/popover'

import type { InboxEntry } from '../model/inbox'

import { ProjectAvatar } from './sidebar'
import { dotClass } from './status-dot'

interface Props {
  entries: InboxEntry[]
  at: { x: number; y: number }
  onOpen: (entry: InboxEntry) => void
  onClose: () => void
}

/** The agents waiting for you, wherever they are; one click takes you to the tab. */
export function Inbox({ at, entries, onClose, onOpen }: Props) {
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
        className="max-h-[70vh] w-[340px] overflow-auto rounded-2xl p-1 shadow-[0_0_0_1px_rgb(43_40_38/0.06),0_16px_40px_-14px_rgb(43_40_38/0.32)]"
      >
        <div className="text-label px-2.5 pt-2 pb-1.5 text-[12px] font-medium">Inbox</div>
        {entries.length === 0 && (
          <div className="text-faint px-2.5 pt-1 pb-3 text-[12.5px] leading-[1.45]">
            Nothing waits for you. Agents that ask or finish show here.
          </div>
        )}
        {entries.map((entry) => (
          <button
            type="button"
            key={entry.tabId}
            className="hover:bg-hover flex items-center gap-2.5 rounded-[8px] px-2.5 py-2"
            onClick={() => {
              onOpen(entry)
              onClose()
            }}
          >
            <span className={dotClass(entry.kind === 'waiting' ? 'waiting' : 'done')} />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate font-medium">{entry.title}</span>
              <span className="text-faint flex items-center gap-1.5 text-[12px]">
                <ProjectAvatar
                  name={entry.projectName}
                  className="size-3.5 rounded-sm text-[8.5px]"
                />
                {entry.projectName} · {entry.workspaceName}
              </span>
            </span>
            <span className="text-faint flex-none text-[11.5px]">
              {entry.kind === 'waiting' ? 'Waiting for you' : 'Done'}
            </span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}
