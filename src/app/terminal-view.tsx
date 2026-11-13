import { useEffect, useRef } from 'react'

import { cn } from '@/lib/utils'

interface Props {
  tabId: string
  attach: (tabId: string, el: HTMLElement, focus?: boolean) => () => void
  /** Takes the keyboard when shown (the default); a terminal that shows itself does not. */
  focus?: boolean
  className?: string
}

/** The tab's terminal, fitted to the pane; the emulator itself lives in `useTerminals`. */
export function TerminalView({ attach, className, focus = true, tabId }: Props) {
  const pane = useRef<HTMLElement>(null)
  const wantsFocus = useRef(focus)
  wantsFocus.current = focus
  useEffect(
    () => (pane.current ? attach(tabId, pane.current, wantsFocus.current) : undefined),
    [attach, tabId]
  )
  return (
    <section
      className={cn('glass relative min-h-0 flex-1', className ?? 'px-4 pt-2 pb-3')}
      ref={pane}
    />
  )
}
