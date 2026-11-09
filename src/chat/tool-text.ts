// How a tool's raw output reads: Read's numbered lines, a command's exit code.

/**
 * Read's output, `cat -n` style (`    12→text` or `12\ttext`), as numbered lines; null when a
 * line is not numbered (an error, a notice), which is then shown as it came.
 */
export function numberedLines(text: string): { n: string; text: string }[] | null {
  const lines = text.replace(/\n$/, '').split('\n')
  const out: { n: string; text: string }[] = []
  for (const l of lines) {
    const m = /^\s*(\d+)(?:\t|→)(.*)$/.exec(l)
    if (!m) return null
    out.push({ n: m[1] ?? '', text: m[2] ?? '' })
  }
  return out.length > 0 ? out : null
}

/** A failed command's output, its `exit code N` line taken out to be shown apart. */
export function exitCode(text: string): { code: number | null; body: string } {
  const m = /^(?:Error: )?exit code (\d+)$/im.exec(text)
  if (!m) return { body: text, code: null }
  const body = (text.slice(0, m.index) + text.slice(m.index + m[0].length)).trim()
  return { body, code: Number(m[1]) }
}
