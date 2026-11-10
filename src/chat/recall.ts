import type { Image, Turn } from './model'

/** What a prompt said, as typed again: a command with its arguments, or its text. */
export function typedText(turn: Turn): string {
  const first = turn.blocks[0]
  if (first?.kind === 'shell') return `!${first.command}`
  if (first?.kind === 'command') return `/${first.name}${first.args === '' ? '' : ` ${first.args}`}`
  return turn.blocks.map((b) => (b.kind === 'text' ? b.text : '')).join('')
}

export const imagesOf = (turn: Turn): Image[] =>
  turn.blocks.flatMap((b) => (b.kind === 'image' ? [{ data: b.data, mediaType: b.mediaType }] : []))

/** The chat's prompts, oldest first, as ↑ walks back through them: no repeats in a row. */
export function sentPrompts(turns: readonly Turn[]): string[] {
  const out: string[] = []
  for (const turn of turns) {
    if (turn.role !== 'user') continue
    const text = typedText(turn).trim()
    if (text !== '' && out.at(-1) !== text) out.push(text)
  }
  return out
}

/**
 * One step through the history (`-1` older, `1` newer) from `at` (null: the new prompt being
 * written). Null again past the newest; the oldest holds.
 */
export function recallStep(length: number, at: number | null, step: number): number | null {
  if (length === 0) return null
  if (at === null) return step < 0 ? length - 1 : null
  const next = at + step
  if (next >= length) return null
  return Math.max(next, 0)
}
