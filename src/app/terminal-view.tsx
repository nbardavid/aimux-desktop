import { useEffect, useRef } from 'react'

interface Props {
  tabId: string
  attach: (tabId: string, el: HTMLElement) => () => void
}

/** The tab's terminal, fitted to the pane; the emulator itself lives in `useTerminals`. */
export function TerminalView({ attach, tabId }: Props) {
  const pane = useRef<HTMLElement>(null)
  useEffect(() => (pane.current ? attach(tabId, pane.current) : undefined), [attach, tabId])
  return <section className="relative min-h-0 flex-1 px-4 pt-2 pb-3" ref={pane} />
}
