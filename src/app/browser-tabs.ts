// The right panel's views: its lists (Changes, Checks) and one browser tab per artifact.
import type { Artifact } from '../model/catalog'

export type PanelView = 'changes' | 'checks' | { browser: string }

export const isBrowser = (view: PanelView): view is { browser: string } => typeof view === 'object'

/** The workspace's open artifacts, newest first: its browser tabs. */
export function browserTabs(artifacts: readonly Artifact[] | undefined): Artifact[] {
  return (artifacts ?? []).filter((a) => a.closed !== true).toSorted((a, b) => b.at - a.at)
}

/** The view after closing `closedUrl`: the next tab to the right, else the left, else Changes. */
export function afterClose(
  view: PanelView,
  tabs: readonly Artifact[],
  closedUrl: string
): PanelView {
  if (!isBrowser(view) || view.browser !== closedUrl) return view
  const at = tabs.findIndex((a) => a.url === closedUrl)
  const next = tabs[at + 1] ?? tabs[at - 1]
  return next ? { browser: next.url } : 'changes'
}

/** What the panel can show of `view`: Checks need a PR, a browser view needs its tab. */
export function shownView(view: PanelView, hasPr: boolean, tabs: readonly Artifact[]): PanelView {
  if (view === 'checks') return hasPr ? 'checks' : 'changes'
  if (isBrowser(view)) return tabs.some((a) => a.url === view.browser) ? view : 'changes'
  return view
}

/** A page's id for its native webview (`browser-<id>`): FNV-1a 64 of its URL, in hex. */
export function browserId(url: string): string {
  let hash = 0xcbf29ce484222325n
  for (const byte of new TextEncoder().encode(url)) {
    hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * 0x100000001b3n)
  }
  return hash.toString(16)
}
