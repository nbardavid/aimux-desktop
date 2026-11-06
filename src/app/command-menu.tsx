import { useEffect, useRef } from 'react'

import { menuGroupLabelClass } from '@/lib/menu-styles'
import { cn } from '@/lib/utils'

import type { SlashCommand } from '../chat/model'

import { commandGroup, commandParts, matchedAlias, shortDescription } from '../chat/commands'
import { pointerMoved } from './pointer'

interface Props {
  /** The listbox's id, for the composer's `aria-controls`; rows are `${id}-${index}`. */
  id: string
  items: SlashCommand[]
  /** What was typed after `/`: an alias it matched shows beside the name. */
  query: string
  hot: number
  onHover: (index: number) => void
  onPick: (command: SlashCommand) => void
}

// The sheet over the composer (a menu: menu-styles.ts), and one 28px row in it.
const SHEET =
  'absolute inset-x-0 bottom-[calc(100%+6px)] z-5 max-h-[min(328px,50vh)] overflow-y-auto rounded-xl p-1'
const ROW = 'flex h-7 min-w-0 items-center gap-2 rounded-md px-2 whitespace-nowrap'

function Row({
  alias,
  command,
  hint = false,
}: {
  command: SlashCommand
  alias?: string
  hint?: boolean
}) {
  const { plugin, short } = commandParts(command.name)
  return (
    <>
      <span
        className={cn(
          'flex-none font-mono text-xs font-medium',
          hint ? 'text-muted-foreground' : 'text-foreground'
        )}
      >
        /{short}
      </span>
      {alias !== undefined && (
        <span className="flex-none font-mono text-xs text-faint">{alias}</span>
      )}
      {command.argumentHint !== '' && (
        // A long hint stops at 40% of the row: the description always shows.
        <span className="max-w-[40%] min-w-0 shrink truncate font-mono text-xs text-label">
          {command.argumentHint}
        </span>
      )}
      <span className="ml-1.5 min-w-0 flex-1 truncate text-xs text-faint">
        {shortDescription(command.description, plugin)}
      </span>
      {plugin !== '' && (
        <span className="flex-none rounded-sm bg-muted px-1.5 text-2xs font-normal text-muted-foreground">
          {plugin}
        </span>
      )}
    </>
  )
}

/** The `/` menu over the composer. The composer keeps the focus and drives it by keyboard. */
export function CommandMenu({ hot, id, items, onHover, onPick, query }: Props) {
  const list = useRef<HTMLDivElement>(null)

  useEffect(() => {
    list.current
      ?.querySelector(`#${CSS.escape(`${id}-${hot}`)}`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [hot, id, items])

  return (
    <div
      className={cn(
        SHEET,
        'bg-popover shadow-popover scroll-p-1',
        'animate-in fade-in zoom-in-[0.98] slide-in-from-bottom-[3px] duration-150 ease-out'
      )}
      ref={list}
      id={id}
      role="listbox"
      aria-label="Commands"
      // The composer keeps the focus (and its caret) through a click.
      onMouseDown={(e) => e.preventDefault()}
    >
      {items.map((command, i) => [
        // Grouped while nothing is typed; a search ranks across both.
        query === '' &&
          commandGroup(command) !== (i > 0 ? commandGroup(items[i - 1] as SlashCommand) : null) && (
            <div
              key={`group:${commandGroup(command)}`}
              className={cn(menuGroupLabelClass, i > 0 && 'mt-1')}
              role="presentation"
            >
              {commandGroup(command)}
            </div>
          ),
        <div
          key={command.name}
          id={`${id}-${i}`}
          role="option"
          tabIndex={-1}
          aria-selected={i === hot}
          className={cn(ROW, i === hot && 'bg-accent')}
          onMouseMove={(e) => pointerMoved(e) && i !== hot && onHover(i)}
          onClick={() => onPick(command)}
        >
          <Row command={command} alias={matchedAlias(command, query)} />
        </div>,
      ])}
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
