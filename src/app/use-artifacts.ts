// The right panel's view per workspace, and what a published artifact does to it.
import { useCallback, useEffect, useRef, useState } from 'react'

import type { Published } from '../chat/model'

import { type Artifact, type Catalog, isNew } from '../model/catalog'
import {
  afterClose,
  browserTabs,
  isBrowser,
  type PanelView,
  republished,
  shownView,
} from './browser-tabs'
import { reloadPage } from './use-browser'

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

/** `VITE_FAKE_ARTIFACTS=10 bun run dev`: that many fake artifacts on every workspace. */
const FAKES = import.meta.env.DEV ? Number(import.meta.env.VITE_FAKE_ARTIFACTS ?? 0) : 0

/** Dev only: fake artifacts, closed and seen in memory, never saved. */
function useFakes() {
  const [fakes, setFakes] = useState<Artifact[]>([])
  useEffect(() => {
    if (FAKES > 0)
      void import('../dev/fake-artifacts').then((m) => setFakes(m.fakeArtifacts(FAKES, Date.now())))
  }, [])
  const isFake = useCallback((url: string) => fakes.some((a) => a.url === url), [fakes])
  const edit = useCallback(
    (url: string, patch: Partial<Artifact>) =>
      setFakes((list) => list.map((a) => (a.url === url ? { ...a, ...patch } : a))),
    []
  )
  return { edit, fakes, isFake }
}

export function useArtifacts(o: Options) {
  const [views, setViews] = useState<Record<string, PanelView>>({})
  /** The page last on screen, per workspace: the Artifacts tab opens it again. */
  const [lasts, setLasts] = useState<Record<string, string>>({})
  const fake = useFakes()
  const ws = o.catalog.workspaces.find((w) => w.id === o.workspaceId)
  const tabs = browserTabs([...(ws?.artifacts ?? []), ...fake.fakes])
  const id = o.workspaceId
  const asked = (id === undefined ? undefined : views[id]) ?? 'changes'
  const view = shownView(asked, o.hasPr, tabs, id === undefined ? null : (lasts[id] ?? null))

  const setView = useCallback(
    (next: PanelView) => {
      if (id !== undefined) setViews((s) => ({ ...s, [id]: next }))
    },
    [id]
  )

  // A page on screen is read (its "new" dot goes), and is the one Artifacts opens next time.
  const onScreen = isBrowser(view) ? tabs.find((a) => a.url === view.browser) : undefined
  const unseen = o.visible && onScreen !== undefined && isNew(onScreen)
  const { seeArtifact } = o
  const { edit: editFake, isFake } = fake
  useEffect(() => {
    if (onScreen === undefined || id === undefined) return
    setLasts((s) => (s[id] === onScreen.url ? s : { ...s, [id]: onScreen.url }))
    if (!unseen) return
    if (isFake(onScreen.url)) editFake(onScreen.url, { seenAt: Date.now() })
    else void seeArtifact(id, onScreen.url).catch(() => {})
  }, [unseen, id, onScreen, seeArtifact, isFake, editFake])

  const latest = useRef(o)
  latest.current = o

  /** A chat published `artifact`: listed; a live one on the workspace on screen comes forward. */
  const published = useCallback(
    (wsId: string, chatId: string, artifact: Published, live: boolean) => {
      const { addArtifact, catalog } = latest.current
      const known = catalog.workspaces.find((w) => w.id === wsId)?.artifacts
      // A new version of a page already open: it reloads.
      if (live && republished(known, artifact.url)) reloadPage(artifact.url)
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

  const close = (url: string) => {
    if (id === undefined) return
    setViews((s) => ({ ...s, [id]: afterClose(view, tabs, url) }))
    if (isFake(url)) editFake(url, { closed: true })
    else void o.closeArtifact(id, url).catch(() => {})
    o.onClosed(url)
  }

  /** The chat an artifact came from, by its title ('' when unknown). */
  const chatOf = (a: Artifact) => o.catalog.chats.find((c) => c.id === a.chatId)?.title ?? ''

  return { chatOf, close, published, setView, tabs, view }
}
