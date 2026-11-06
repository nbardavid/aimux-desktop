// Fake artifacts to try the Artifacts tab at scale: `VITE_FAKE_ARTIFACTS=10 bun run dev`
// adds them to every workspace (in memory, never saved), and `?artifacts` in the preview.
// Real public pages, so the in-app browser has something to load.
import type { Artifact } from '../model/catalog'

const PAGES: [title: string, url: string][] = [
  ['How a chat streams, end to end', 'https://example.com/'],
  ['Worktrees: one per workspace', 'https://git-scm.com/docs/git-worktree'],
  ['The background host, drawn', 'https://en.wikipedia.org/wiki/Daemon_(computing)'],
  ['Menus: before and after Base UI', 'https://base-ui.com/react/components/menu'],
  ['Release notes 0.3 at a glance', 'https://en.wikipedia.org/wiki/Release_notes'],
  ['Quota windows explained', 'https://en.wikipedia.org/wiki/Rate_limiting'],
  ['Diff panel: hunks and stages', 'https://git-scm.com/docs/git-diff'],
  ['Tauri child webviews', 'https://v2.tauri.app/'],
  ['Colour pool for workspace names', 'https://en.wikipedia.org/wiki/Web_colors'],
  [
    'Keyboard map of the app',
    'https://developer.apple.com/design/human-interface-guidelines/keyboards',
  ],
  ['Merge flow with gh', 'https://cli.github.com/manual/gh_pr_merge'],
  ['Session resume from transcripts', 'https://en.wikipedia.org/wiki/Session_(computer_science)'],
]

/** `count` fake artifacts (at most 12), one published every 7 minutes back from `now`; the newest two unread. */
export function fakeArtifacts(count: number, now: number): Artifact[] {
  return PAGES.slice(0, Math.max(0, count)).map(([title, url], i) => {
    const at = now - i * 7 * 60_000
    return { at, chatId: '', seenAt: i < 2 ? null : at + 60_000, title, url }
  })
}
