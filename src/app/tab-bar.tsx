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
  sideOpen: boolean
  gitOpen: boolean
  onToggleSide: () => void
  onToggleGit: () => void
}

export function TabBar(props: Props) {
  const { activeId, done, onClose, onNew, onSelect, tabs } = props
  return (
    <div
      className={props.sideOpen ? 'tabbar' : 'tabbar no-side'}
      role="tablist"
      aria-label="Tabs"
      data-tauri-drag-region
    >
      {tabs.map((tab, i) => {
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
              <span className="tab-index">{i + 1}</span>
              <span>{tab.title}</span>
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
      <button type="button" className="tab-add" aria-label="New tab" onClick={onNew}>
        <Icon name="plus" small />
      </button>
      <span className="tab-tools">
        <button
          type="button"
          className={props.sideOpen ? 'icon-btn is-on' : 'icon-btn'}
          aria-label="Projects sidebar (⌘B)"
          aria-pressed={props.sideOpen}
          title="Projects sidebar (⌘B)"
          onClick={props.onToggleSide}
        >
          <Icon name="panelLeft" small />
        </button>
        <button
          type="button"
          className={props.gitOpen ? 'icon-btn is-on' : 'icon-btn'}
          aria-label="Git panel (⌥⌘B)"
          aria-pressed={props.gitOpen}
          title="Git panel (⌥⌘B)"
          onClick={props.onToggleGit}
        >
          <Icon name="panelRight" small />
        </button>
      </span>
    </div>
  )
}
