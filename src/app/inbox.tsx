import { useEffect } from 'react'

import type { InboxEntry } from '../model/inbox'

import { ProjectAvatar } from './sidebar'

interface Props {
  entries: InboxEntry[]
  at: { x: number; y: number }
  onOpen: (entry: InboxEntry) => void
  onClose: () => void
}

/** The agents waiting for you, wherever they are; one click takes you to the tab. */
export function Inbox({ at, entries, onClose, onOpen }: Props) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])

  return (
    <div className="scrim is-clear" onMouseDown={onClose}>
      <div
        className="inbox"
        style={{ left: at.x, top: at.y }}
        role="dialog"
        aria-label="Inbox"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="inbox-head">Inbox</div>
        {entries.length === 0 && (
          <div className="inbox-empty">
            Nothing waits for you. Agents that ask or finish show here.
          </div>
        )}
        {entries.map((entry) => (
          <button
            type="button"
            key={entry.tabId}
            className="inbox-row"
            onClick={() => {
              onOpen(entry)
              onClose()
            }}
          >
            <span className={entry.kind === 'waiting' ? 'st st-waiting' : 'st st-done'} />
            <span className="grow">
              <span className="inbox-title">{entry.title}</span>
              <span className="inbox-where">
                <ProjectAvatar name={entry.projectName} />
                {entry.projectName} · {entry.workspaceName}
              </span>
            </span>
            <span className="inbox-kind">
              {entry.kind === 'waiting' ? 'Waiting for you' : 'Done'}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
