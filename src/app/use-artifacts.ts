// The right panel's view per workspace, and what a published artifact does to it.
import { useCallback, useEffect, useRef, useState } from 'react'

import type { Published } from '../chat/model'

import { type Catalog, isNew } from '../model/catalog'
import { afterClose, browserTabs, isBrowser, type PanelView, shownView } from './browser-tabs'

interface Options {
  catalog: Catalog
  /** The workspace on screen. */
  workspaceId: string | undefined
  /** The panel is on screen (open, normal mode): a page shown there is seen. */
  visible: boolean
  hasPr: boolean
  addArtifact: (
    wsId: string,
    url: string,
    title: string,
    chatId: string,
    live: boolean
  ) => Promise<void>
  closeArtifact: (wsId: string, url: string) => Promise<void>
  seeArtifact: (wsId: string, url: string) => Promise<void>
  /** Opens the panel (⌥⌘B's state) for a page that just arrived. */
  openPanel: () => void
  /** A page closed for good: its native webview can go. */
  onClosed: (url: string) => void
}

export function useArtifacts(o: Options) {
  const [views, setViews] = useState<Record<string, PanelView>>({})
  const ws = o.catalog.workspaces.find((w) => w.id === o.workspaceId)
  const tabs = browserTabs(ws?.artifacts)
  const asked = (o.workspaceId === undefined ? undefined : views[o.workspaceId]) ?? 'changes'
  const view = shownView(asked, o.hasPr, tabs)

  const setView = useCallback(
    (next: PanelView) => {
      const id = o.workspaceId
      if (id !== undefined) setViews((s) => ({ ...s, [id]: next }))
    },
    [o.workspaceId]
  )

  // A page on screen is read: its tab loses the "new" dot.
  const onScreen = isBrowser(view) ? tabs.find((a) => a.url === view.browser) : undefined
  const unseen = o.visible && onScreen !== undefined && isNew(onScreen)
  const { seeArtifact, workspaceId } = o
  useEffect(() => {
    if (unseen && workspaceId !== undefined && onScreen !== undefined) {
      void seeArtifact(workspaceId, onScreen.url).catch(() => {})
    }
  }, [unseen, workspaceId, onScreen, seeArtifact])

  const latest = useRef(o)
  latest.current = o

  /** A chat published `artifact`: listed; a live one on the workspace on screen comes forward. */
  const published = useCallback(
    (wsId: string, chatId: string, artifact: Published, live: boolean) => {
      const { addArtifact } = latest.current
      void addArtifact(wsId, artifact.url, artifact.title, chatId, live)
        .then(() => {
          if (!live || latest.current.workspaceId !== wsId) return
          latest.current.openPanel()
          setViews((s) => ({ ...s, [wsId]: { browser: artifact.url } }))
        })
        .catch(() => {})
    },
    []
  )

  const close = useCallback(
    (url: string) => {
      const id = o.workspaceId
      if (id === undefined) return
      setViews((s) => ({ ...s, [id]: afterClose(s[id] ?? 'changes', tabs, url) }))
      void o.closeArtifact(id, url).catch(() => {})
      o.onClosed(url)
    },
    [o, tabs]
  )

  return { close, published, setView, tabs, view }
}
