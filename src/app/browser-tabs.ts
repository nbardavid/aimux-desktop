// The right panel's views: Changes, Checks, and Artifacts (a page, or none yet).
import type { Artifact } from '../model/catalog'

/** `artifacts` is the Artifacts tab with no page to show; `{ browser }` shows one. */
export type PanelView = 'changes' | 'checks' | 'artifacts' | { browser: string }

export const isBrowser = (view: PanelView): view is { browser: string } => typeof view === 'object'

/** The workspace's open artifacts, newest first. */
export function browserTabs(artifacts: readonly Artifact[] | undefined): Artifact[] {
  return (artifacts ?? []).filter((a) => a.closed !== true).toSorted((a, b) => b.at - a.at)
}

/** After closing `closedUrl`: the next artifact (older), else the newer one, else none. */
export function afterClose(
  view: PanelView,
  tabs: readonly Artifact[],
  closedUrl: string
): PanelView {
  if (!isBrowser(view) || view.browser !== closedUrl) return view
  const at = tabs.findIndex((a) => a.url === closedUrl)
  const next = tabs[at + 1] ?? tabs[at - 1]
  return next ? { browser: next.url } : 'artifacts'
}

/**
 * What the panel can show of `view`: Checks need a PR; Artifacts shows the page last seen
 * (`last`) if it is still there, else the newest, else its empty state.
 */
export function shownView(
  view: PanelView,
  hasPr: boolean,
  tabs: readonly Artifact[],
  last: string | null
): PanelView {
  if (view === 'checks') return hasPr ? 'checks' : 'changes'
  if (view === 'changes') return view
  const has = (url: string | null) => url !== null && tabs.some((a) => a.url === url)
  if (isBrowser(view) && has(view.browser)) return view
  if (last !== null && has(last)) return { browser: last }
  return tabs[0] ? { browser: tabs[0].url } : 'artifacts'
}

/** A page's id for its native webview (`browser-<id>`): FNV-1a 64 of its URL, in hex. */
export function browserId(url: string): string {
  let hash = 0xcbf29ce484222325n
  for (const byte of new TextEncoder().encode(url)) {
    hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * 0x100000001b3n)
  }
  return hash.toString(16)
}

/** A live publish of a URL the workspace already had: its page reloads. */
export function republished(artifacts: readonly Artifact[] | undefined, url: string): boolean {
  return (artifacts ?? []).some((a) => a.url === url)
}

/** Tabs titled by Claude, else by their page's current title (kept in memory, by page id). */
export function withPageTitles(
  tabs: readonly Artifact[],
  titles: Readonly<Record<string, string>>
): Artifact[] {
  return tabs.map((a) => (a.title === '' ? { ...a, title: titles[browserId(a.url)] ?? '' } : a))
}

/** The chat keeps at least this much beside a page (its 1px splitter included). */
const CHAT_MIN = 421

/** The widest a page may be: the window, less the sidebar, less the chat's minimum. */
export function pageCap(windowWidth: number, side: number): number {
  return Math.max(0, windowWidth - side - CHAT_MIN)
}

/** The artifacts whose title (or "Artifact" when it has none) or chat contains `query`. */
export function matchArtifacts(
  list: readonly Artifact[],
  query: string,
  chatOf: (a: Artifact) => string
): Artifact[] {
  const q = query.trim().toLowerCase()
  if (q === '') return [...list]
  return list.filter((a) => `${a.title || 'Artifact'} ${chatOf(a)}`.toLowerCase().includes(q))
}
