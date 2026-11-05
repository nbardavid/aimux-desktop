import { useEffect, useRef } from 'react'

import { cn } from '@/lib/utils'

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

// The sheet over the composer, and one 32px row in it.
const SHEET =
  'absolute inset-x-0 bottom-[calc(100%+6px)] z-5 max-h-[min(328px,50vh)] overflow-y-auto rounded-2xl p-1'
const ROW = 'flex h-8 min-w-0 items-baseline gap-2 rounded-lg px-2.5 leading-8 whitespace-nowrap'

function Row({ command, hint = false }: { command: SlashCommand; hint?: boolean }) {
  const { plugin, short } = parts(command.name)
  return (
    <>
      <span
        className={cn(
          'flex-none font-mono text-[12.5px] font-medium',
          hint ? 'text-muted-foreground' : 'text-foreground'
        )}
      >
        /{short}
      </span>
      {command.argumentHint !== '' && (
        // A long hint gives way before the row overflows its sheet.
        <span className="min-w-0 shrink truncate font-mono text-[12px] text-label">
          {command.argumentHint}
        </span>
      )}
      <span className="ml-1.5 min-w-0 flex-1 truncate text-[12.5px] text-faint">
        {command.description}
      </span>
      {plugin !== '' && (
        <span className="flex-none self-center rounded-sm bg-pill px-1.5 text-[10.5px] leading-[17px] text-muted-foreground">
          {plugin}
        </span>
      )}
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
      className={cn(
        SHEET,
        'bg-background shadow-[0_0_0_1px_rgb(43_40_38/0.07),0_12px_32px_-12px_rgb(43_40_38/0.28)] scroll-p-1',
        'animate-in fade-in zoom-in-[0.99] slide-in-from-bottom-1 duration-140 ease-[cubic-bezier(0.2,0,0,1)]'
      )}
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
          className={cn(ROW, i === hot && 'bg-hover')}
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
    <div
      className={cn(SHEET, 'overflow-hidden bg-chrome shadow-[0_0_0_1px_var(--border)]')}
      aria-live="polite"
    >
      <div className={ROW}>
        <Row command={command} hint />
      </div>
    </div>
  )
}
