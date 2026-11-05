import { useEffect, useRef } from 'react'

import type { SlashCommand } from '../chat/model'

import { pointerMoved } from './pointer'

interface Props {
  /** The listbox's id, for the composer's `aria-controls`; rows are `${id}-${index}`. */
  id: string
  items: SlashCommand[]
  hot: number
  onHover: (index: number) => void
  onPick: (command: SlashCommand) => void
}

/** `plugin:name` is shown as `name`, with its plugin beside it. */
function parts(name: string) {
  const at = name.indexOf(':')
  return at === -1
    ? { plugin: '', short: name }
    : { plugin: name.slice(0, at), short: name.slice(at + 1) }
}

function Row({ command }: { command: SlashCommand }) {
  const { plugin, short } = parts(command.name)
  return (
    <>
      <span className="cmd-name">/{short}</span>
      {command.argumentHint !== '' && <span className="cmd-hint">{command.argumentHint}</span>}
      <span className="cmd-desc">{command.description}</span>
      {plugin !== '' && <span className="cmd-src">{plugin}</span>}
    </>
  )
}

/** The `/` menu over the composer. The composer keeps the focus and drives it by keyboard. */
export function CommandMenu({ hot, id, items, onHover, onPick }: Props) {
  const list = useRef<HTMLDivElement>(null)

  useEffect(() => {
    list.current?.children[hot]?.scrollIntoView({ block: 'nearest' })
  }, [hot, items])

  return (
    <div
      className="cmd-menu"
      ref={list}
      id={id}
      role="listbox"
      aria-label="Commands"
      // The composer keeps the focus (and its caret) through a click.
      onMouseDown={(e) => e.preventDefault()}
    >
      {items.map((command, i) => (
        <div
          key={command.name}
          id={`${id}-${i}`}
          role="option"
          tabIndex={-1}
          aria-selected={i === hot}
          className={i === hot ? 'cmd is-hot' : 'cmd'}
          onMouseMove={(e) => pointerMoved(e) && i !== hot && onHover(i)}
          onClick={() => onPick(command)}
        >
          <Row command={command} />
        </div>
      ))}
    </div>
  )
}

/** Once the name is typed, what it takes. */
export function CommandHint({ command }: { command: SlashCommand }) {
  return (
    <div className="cmd-menu is-hint" aria-live="polite">
      <div className="cmd">
        <Row command={command} />
      </div>
    </div>
  )
}
