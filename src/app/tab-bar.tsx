import type { TabSessionSummary } from '@aimux/ipc'

import { signalOf } from '../model/catalog'
import { Icon } from './icons'
import { StatusDot } from './status-dot'

interface Props {
  tabs: TabSessionSummary[]
  activeId: string | undefined
  done: ReadonlySet<string>
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onNew: () => void
}

export function TabBar({ activeId, done, onClose, onNew, onSelect, tabs }: Props) {
  return (
    <div className="tabbar" role="tablist" aria-label="Tabs">
      {tabs.map((tab) => {
        const active = tab.id === activeId
        const signal = signalOf([tab], done)
        return (
          <div key={tab.id} className={active ? 'tab is-active' : 'tab'}>
            <button
              type="button"
              role="tab"
              aria-selected={active}
              className="tab-main"
              title={tab.title}
              onClick={() => onSelect(tab.id)}
            >
              <span className="tab-title">{tab.title}</span>
              {signal && <StatusDot signal={signal} />}
            </button>
            <button
              type="button"
              className="tab-close"
              aria-label={`Close ${tab.title}`}
              onClick={() => onClose(tab.id)}
            >
              <Icon name="close" small />
            </button>
          </div>
        )
      })}
      <button type="button" className="tab-add" aria-label="New tab (⌘T)" onClick={onNew}>
        <Icon name="plus" />
      </button>
    </div>
  )
}
