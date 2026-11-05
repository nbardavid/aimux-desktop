import {
  type ClipboardEvent,
  type CompositionEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type WheelEvent,
} from 'react'

import { Sidebar } from './app/sidebar'
import { useDaemon } from './app/use-daemon'
import { xterm256Palette } from './terminal/colors'
import { measureCell } from './terminal/grid'
import { encodeKey, encodePaste, wheelLines } from './terminal/input'
import { TERMINAL_FONT, TerminalPane } from './terminal/terminal-pane'

// ponytail: fixed dark palette; read the user's theme once the GUI has settings.
const PALETTE = xterm256Palette([
  '#15161e',
  '#f7768e',
  '#9ece6a',
  '#e0af68',
  '#7aa2f7',
  '#bb9af7',
  '#7dcfff',
  '#a9b1d6',
  '#414868',
  '#ff899d',
  '#b9f27c',
  '#ffc777',
  '#8db0ff',
  '#c7a9ff',
  '#a4daff',
  '#c0caf5',
])
const RESIZE_DEBOUNCE_MS = 100

export function App() {
  const daemon = useDaemon()
  const { resize, scroll, scrollToBottom, session, status, write } = daemon
  const tab = session.tabs.find((t) => t.id === daemon.activeTabId) ?? session.tabs[0]
  const viewport = tab ? session.viewports[tab.id] : undefined
  const cellHeight = useMemo(() => measureCell(TERMINAL_FONT).height, [])
  const input = useRef<HTMLTextAreaElement>(null)
  const wheelCarry = useRef(0)
  const resizeTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const tabRef = useRef(tab?.id)
  tabRef.current = tab?.id

  useEffect(() => input.current?.focus(), [tab?.id])

  const type = (data: string) => {
    if (!tab) return
    const snapshot = viewport?.snapshot
    if (snapshot && snapshot.viewportY < snapshot.baseY) scrollToBottom(tab.id)
    write(tab.id, data)
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return
    const data = encodeKey(e)
    if (data === null) return
    e.preventDefault()
    type(data)
  }

  const onComposition = (e: CompositionEvent<HTMLTextAreaElement>) => {
    if (e.data) type(e.data)
    e.currentTarget.value = ''
  }

  const onPaste = (e: ClipboardEvent) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    if (text) type(encodePaste(text, viewport?.modes.bracketedPasteMode ?? false))
  }

  const onWheel = (e: WheelEvent) => {
    if (!tab) return
    // Trackpads send a few pixels per event: carry the remainder until it makes a line.
    wheelCarry.current += e.deltaMode === 1 ? e.deltaY * cellHeight : e.deltaY
    const lines = wheelLines(wheelCarry.current, 0, cellHeight)
    if (lines === 0) return
    wheelCarry.current -= lines * cellHeight
    scroll(tab.id, lines)
  }

  // Native selection stays usable: refocus the input only when nothing is selected.
  const onMouseUp = () => {
    if (window.getSelection()?.isCollapsed !== false) input.current?.focus()
  }

  const onResize = useCallback(
    (cols: number, rows: number) => {
      clearTimeout(resizeTimer.current)
      resizeTimer.current = setTimeout(() => {
        if (tabRef.current !== undefined) resize(tabRef.current, cols, rows)
      }, RESIZE_DEBOUNCE_MS)
    },
    [resize]
  )

  if (status.kind !== 'ready' && status.kind !== 'reconnecting') {
    const message = {
      'error': status.kind === 'error' ? status.message : '',
      'loading': 'Connecting to aimux…',
      'no-projects': 'No projects yet. Run `aimux` inside a repo.',
    }[status.kind]
    return <main className="empty">{message}</main>
  }

  return (
    <main className="shell">
      <Sidebar
        projects={daemon.projects}
        projectId={daemon.projectId}
        tabs={session.tabs}
        tabId={tab?.id}
        onProject={daemon.selectProject}
        onTab={daemon.setActiveTabId}
      />
      <section
        className="pane"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onWheel={onWheel}
        onMouseUp={onMouseUp}
      >
        {status.kind === 'reconnecting' && (
          <div className="banner" role="status">
            Daemon disconnected — reconnecting…
          </div>
        )}
        {tab ? (
          <TerminalPane snapshot={viewport?.snapshot} palette={PALETTE} onResize={onResize} />
        ) : (
          <p className="empty">No tabs in this project.</p>
        )}
        <textarea
          ref={input}
          className="input-sink"
          aria-label="Terminal input"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          onCompositionEnd={onComposition}
        />
      </section>
    </main>
  )
}
