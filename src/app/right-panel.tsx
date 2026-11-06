// The right panel: the git panel's lists, or a page (an artifact) at its own wider width.
import { useRef, useState } from 'react'

import type { MenuState } from './context-menu'
import type { useArtifacts } from './use-artifacts'

import { browserId, isBrowser } from './browser-tabs'
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
} from './use-layout'

type Owned = 'width' | 'tabs' | 'view' | 'onView' | 'onTabMenu' | 'browser'

export function RightPanel({
  artifacts,
  layout,
  onMenu,
  open,
  panel,
  update,
}: {
  open: boolean
  layout: Layout
  update: (patch: Partial<Layout>) => void
  artifacts: ReturnType<typeof useArtifacts>
  /** A page tab's right-click menu. */
  onMenu: (menu: MenuState) => void
  /** The workspace's git panel, or undefined with no workspace. */
  panel: Omit<GitPanelProps, Owned> | undefined
}) {
  const placeholder = useRef<HTMLDivElement>(null)
  const { view } = artifacts
  const page = isBrowser(view) ? artifacts.tabs.find((a) => a.url === view.browser) : undefined
  const dragged = page ? layout.browserWidth : layout.gitWidth
  const fallback = page ? BROWSER_WIDTH : GIT_WIDTH
  const width = dragged === null ? fallback : `${dragged}px`
  const [min, max] = page ? LIMITS.browser : LIMITS.git

  const [sliding, setSliding] = useState(false)
  const covered = useCovered(placeholder)
  const shown = browserShown({ covered, mode: 'normal', panelOpen: open, sliding, view })
  const loaded = useBrowser(page?.url, placeholder, shown && page !== undefined)
  const { retitle, tabs } = artifacts
  usePageTitles((id, title) => {
    const tab = tabs.find((a) => browserId(a.url) === id)
    if (tab && tab.title === '' && title !== '') retitle(tab.url, title)
  })
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
          />
          <GitPanel
            {...panel}
            width={width}
            tabs={artifacts.tabs}
            view={view}
            onView={artifacts.setView}
            onTabMenu={(url, at) =>
              onMenu({ ...at, items: [{ label: 'Close', run: () => artifacts.close(url) }] })
            }
            browser={
              page && <BrowserView artifact={page} placeholder={placeholder} cover={cover} />
            }
          />
        </>
      )}
    </Slide>
  )
}
