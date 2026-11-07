// The artifacts a chat published: Claude Code's `Artifact` tool calls and the links they gave.
import type { Block } from './model'

const str = (v: unknown) => (typeof v === 'string' ? v : '')

/** An artifact Claude Code's `Artifact` tool published (or opened): its claude.ai page. */
export interface Published {
  url: string
  /** The title Claude gave it, or '' (the page's own title shows once loaded). */
  title: string
  toolId: string
}

const ARTIFACT_URL = /https:\/\/claude\.ai\/(?:code\/)?artifact\/[A-Za-z0-9-]+/

/** The claude.ai artifact link in a tool's result text, if any. */
export function artifactUrl(text: string): string | null {
  return ARTIFACT_URL.exec(text)?.[0] ?? null
}

/** Every publish or open call that succeeded with a link, in order (repeats included). */
function publishCalls(blocks: readonly Block[]): Published[] {
  const out: Published[] = []
  for (const b of blocks) {
    if (b.kind !== 'tool' || b.name !== 'Artifact' || !b.result || b.result.isError) continue
    const action = str(b.input.action)
    if (action !== '' && action !== 'publish' && action !== 'open') continue
    const url = artifactUrl(b.result.text)
    if (url !== null) out.push({ title: str(b.input.title), toolId: b.id, url })
  }
  return out
}

/** A chat's artifacts, one per link, each with its last title. */
export function publishedArtifacts(blocks: readonly Block[]): Published[] {
  const byUrl = new Map<string, Published>()
  for (const p of publishCalls(blocks)) {
    byUrl.delete(p.url)
    byUrl.set(p.url, p)
  }
  return [...byUrl.values()]
}

/** The publishes that completed between two states of a chat. */
export function newPublishes(before: readonly Block[], after: readonly Block[]): Published[] {
  const seen = new Set(publishCalls(before).map((p) => p.toolId))
  return publishCalls(after).filter((p) => !seen.has(p.toolId))
}
