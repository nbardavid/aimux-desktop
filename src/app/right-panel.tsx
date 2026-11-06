// The right panel: the git panel's lists, or a page (an artifact) at its own wider width.
import { useRef } from 'react'

import type { MenuState } from './context-menu'
import type { useArtifacts } from './use-artifacts'

import { isBrowser } from './browser-tabs'
import { BrowserView, nativePages, PageStandIn } from './browser-view'
import { GitPanel, type GitPanelProps } from './git-panel'
import { Slide, Splitter } from './splitter'
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
  return (
    <Slide open={open} width={`calc(${width} + 1px)`} widthKey={page ? 'page' : 'list'}>
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
              page && (
                <BrowserView
                  artifact={page}
                  placeholder={placeholder}
                  cover={nativePages ? null : <PageStandIn artifact={page} />}
                />
              )
            }
          />
        </>
      )}
    </Slide>
  )
}
