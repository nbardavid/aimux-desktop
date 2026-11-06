// The right panel: the git panel's lists, or a page (an artifact) at its own wider width.
import { useState } from 'react'

import type { useArtifacts } from './use-artifacts'

import { isNew } from '../model/catalog'
import { isBrowser, pageCap, withPageTitles } from './browser-tabs'
import { BrowserView, nativePages, PageStandIn } from './browser-view'
import { GitPanel, type GitPanelProps, spinner } from './git-panel'
import { Slide, Splitter } from './splitter'
import { browserShown, useBrowser, useCovered, usePageTitles } from './use-browser'
import {
  BROWSER_WIDTH,
  browserWidthNow,
  GIT_WIDTH,
  gitWidthNow,
  type Layout,
  LIMITS,
  SIDE_WIDTH,
  sideWidthNow,
} from './use-layout'

type Owned = 'width' | 'artifacts' | 'view' | 'onView' | 'browser'

export function RightPanel({
  artifacts,
  layout,
  open,
  panel,
  update,
}: {
  open: boolean
  layout: Layout
  update: (patch: Partial<Layout>) => void
  artifacts: ReturnType<typeof useArtifacts>
  /** The workspace's git panel, or undefined with no workspace. */
  panel: Omit<GitPanelProps, Owned> | undefined
}) {
  // Held in state: the effects that lay the page over it run again once it mounts.
  const [placeholder, setPlaceholder] = useState<HTMLDivElement | null>(null)
  const [titles, setTitles] = useState<Record<string, string>>({})
  usePageTitles((id, title) => setTitles((t) => ({ ...t, [id]: title })))
  const tabs = withPageTitles(artifacts.tabs, titles)
  const { view } = artifacts
  const page = isBrowser(view) ? tabs.find((a) => a.url === view.browser) : undefined

  // A page never leaves the chat less than its minimum, whatever was dragged or the window does.
  const side = layout.sideWidth === null ? SIDE_WIDTH : `${layout.sideWidth}px`
  const sideNow = layout.sideOpen ? (layout.sideWidth ?? sideWidthNow()) + 1 : 0
  const dragged = page ? layout.browserWidth : layout.gitWidth
  const fallback = page ? BROWSER_WIDTH : GIT_WIDTH
  const wanted = dragged === null ? fallback : `${dragged}px`
  const room = layout.sideOpen ? `calc(100vw - ${side} - 422px)` : 'calc(100vw - 421px)'
  const width = page ? `min(${wanted}, ${room})` : wanted
  const [min, max] = page
    ? [LIMITS.browser[0], Math.min(LIMITS.browser[1], pageCap(window.innerWidth, sideNow))]
    : LIMITS.git

  const [sliding, setSliding] = useState(false)
  const [dragging, setDragging] = useState(false)
  const covered = useCovered(placeholder)
  const settled = !sliding && !dragging
  const shown = browserShown({ covered, mode: 'normal', panelOpen: open, sliding: !settled, view })
  const loaded = useBrowser(page?.url, placeholder, shown && page !== undefined)
  let cover = null
  if (!nativePages && page) cover = <PageStandIn artifact={page} />
  else if (!loaded) cover = <div className="grid h-full place-items-center">{spinner}</div>
  return (
    <Slide
      open={open}
      width={`calc(${width} + 1px)`}
      widthKey={page ? 'page' : 'list'}
      onSliding={setSliding}
    >
      {panel && (
        <>
          <Splitter
            label="Resize the git panel"
            value={
              page ? (layout.browserWidth ?? browserWidthNow()) : (layout.gitWidth ?? gitWidthNow())
            }
            min={min}
            max={max}
            direction={-1}
            onChange={(w) => update(page ? { browserWidth: w } : { gitWidth: w })}
            onDragging={setDragging}
          />
          <GitPanel
            {...panel}
            width={width}
            artifacts={{ count: tabs.length, unread: tabs.some(isNew) }}
            view={view}
            onView={artifacts.setView}
            browser={
              page && (
                <BrowserView
                  artifact={page}
                  list={tabs}
                  chatOf={artifacts.chatOf}
                  onPick={(url) => artifacts.setView({ browser: url })}
                  onClose={artifacts.close}
                  placeholder={setPlaceholder}
                  cover={cover}
                />
              )
            }
          />
        </>
      )}
    </Slide>
  )
}
