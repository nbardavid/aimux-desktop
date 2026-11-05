import type { TabSessionSummary } from '@aimux/ipc'

import { signalOf } from '../model/catalog'
import { Icon } from './icons'
import { StatusDot } from './status-dot'

export interface ChatItem {
  id: string
  title: string
  working: boolean
}

interface Props {
  tabs: TabSessionSummary[]
  chats: ChatItem[]
  /** A terminal tab's or a chat's id. */
  activeId: string | undefined
  done: ReadonlySet<string>
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onNew: () => void
  onSelectChat: (id: string) => void
  onCloseChat: (id: string) => void
}

export function TabBar(props: Props) {
  const { activeId, chats, done, onClose, onNew, onSelect, tabs } = props
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
      {chats.map((chat) => {
        const active = chat.id === activeId
        return (
          <div key={chat.id} className={active ? 'tab is-active' : 'tab'}>
            <button
              type="button"
              role="tab"
              aria-selected={active}
              className="tab-main"
              onClick={() => props.onSelectChat(chat.id)}
            >
              <Icon name="chat" small />
              <span className="tab-title">{chat.title}</span>
              {chat.working && <span className="st st-working" />}
            </button>
            <button
              type="button"
              className="tab-close"
              aria-label={`Close ${chat.title}`}
              onClick={() => props.onCloseChat(chat.id)}
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
