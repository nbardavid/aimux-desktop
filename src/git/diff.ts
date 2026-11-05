export interface DiffLine {
  kind: 'hunk' | 'add' | 'del' | 'ctx'
  /** Line number in the old file. */
  a?: number
  /** Line number in the new file. */
  b?: number
  text: string
}

const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/

/** A unified diff, without its file headers. */
export function parseUnifiedDiff(raw: string): DiffLine[] {
  const lines: DiffLine[] = []
  let a = 0
  let b = 0
  let inHunk = false
  for (const line of raw.split('\n')) {
    const hunk = HUNK.exec(line)
    if (hunk) {
      a = Number(hunk[1])
      b = Number(hunk[2])
      inHunk = true
      lines.push({ kind: 'hunk', text: line })
    } else if (!inHunk || line.startsWith('\\')) {
      // file headers, "\ No newline at end of file"
    } else if (line.startsWith('+')) {
      lines.push({ b: b++, kind: 'add', text: line.slice(1) })
    } else if (line.startsWith('-')) {
      lines.push({ a: a++, kind: 'del', text: line.slice(1) })
    } else if (line.startsWith(' ')) {
      lines.push({ a: a++, b: b++, kind: 'ctx', text: line.slice(1) })
    } else if (line.startsWith('diff ')) {
      inHunk = false
    }
  }
  return lines
}
