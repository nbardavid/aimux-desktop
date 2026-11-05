import { useEffect, useRef } from 'react'

interface Props {
  tabId: string
  attach: (tabId: string, el: HTMLElement) => () => void
}

/** The tab's terminal, fitted to the pane; the emulator itself lives in `useTerminals`. */
export function TerminalView({ attach, tabId }: Props) {
  const pane = useRef<HTMLElement>(null)
  useEffect(() => (pane.current ? attach(tabId, pane.current) : undefined), [attach, tabId])
  return <section className="term" ref={pane} />
}
