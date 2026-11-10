// Claude Code's bash mode: a `!` command typed in the composer, run in the worktree, and
// what it printed, as the chat shows it and as the conversation keeps it.

import type { Block, ChatState, Turn } from './model'

// oxlint-disable-next-line no-control-regex -- terminal colours in what a command printed
const ANSI = /\u001B\[[\d;]*m/g

export const BASH_IN = /<bash-input>([\s\S]*?)<\/bash-input>/
export const BASH_OUT = /<bash-(stdout|stderr)>/
const BASH_STDOUT = /<bash-stdout>([\s\S]*?)<\/bash-stdout>/
const BASH_STDERR = /<bash-stderr>([\s\S]*?)<\/bash-stderr>/
const BASH_EXIT = /<bash-exit-code>(-?\d+)<\/bash-exit-code>/

/** The text Claude Code escapes in its rows (`&&` comes as `&amp;&amp;`). */
export const unescapeRow = (t: string) =>
  t
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&amp;', '&')

/** What a bash-mode row says the command printed: stdout, then stderr, and its exit code. */
export function shellOutput(text: string): { output: string; exitCode: number | null } {
  const out = unescapeRow(BASH_STDOUT.exec(text)?.[1] ?? '').replaceAll(ANSI, '')
  const err = unescapeRow(BASH_STDERR.exec(text)?.[1] ?? '').replaceAll(ANSI, '')
  const code = BASH_EXIT.exec(text)?.[1]
  return {
    exitCode: code === undefined ? null : Number(code),
    output: [out.trimEnd(), err.trimEnd()].filter((t) => t !== '').join('\n'),
  }
}

/** A `!` command, run: shown at once, its output filled in when it comes. */
export function addShellTurn(state: ChatState, command: string, id: string): ChatState {
  const turn: Turn = {
    blocks: [{ command, exitCode: null, kind: 'shell', output: null }],
    id,
    role: 'user',
  }
  return { ...state, errors: [], turns: [...state.turns, turn] }
}

/** The output of the last `!` command still running. */
export function withShellOutput(state: ChatState, text: string): ChatState {
  const at = state.turns.findLastIndex(
    (t) => t.blocks[0]?.kind === 'shell' && t.blocks[0].output === null
  )
  const turn = state.turns[at]
  const block = turn?.blocks[0]
  if (turn === undefined || block?.kind !== 'shell') return state
  const done: Block = { ...block, ...shellOutput(text) }
  const turns = state.turns.with(at, { ...turn, blocks: [done] })
  return { ...state, turns }
}

/**
 * A `!` command and its output, as the conversation keeps them: added to it without a
 * turn (`shouldQuery: false`), so Claude reads them with the next prompt, as in the TUI.
 */
export function shellContextLine(command: string, output: string, exitCode: number | null) {
  const code =
    exitCode === null || exitCode === 0 ? '' : `<bash-exit-code>${exitCode}</bash-exit-code>`
  return JSON.stringify({
    message: {
      content: `<bash-input>${command}</bash-input>\n<bash-stdout>${output}</bash-stdout><bash-stderr></bash-stderr>${code}`,
      role: 'user',
    },
    parent_tool_use_id: null,
    session_id: '',
    shouldQuery: false,
    type: 'user',
  })
}

/** The `!` commands whose output `line` just brought: Claude is to be told of them. */
export function shellsDone(
  before: ChatState,
  after: ChatState
): Extract<Block, { kind: 'shell' }>[] {
  if (before.turns === after.turns) return []
  const running = new Set(
    before.turns
      .filter((t) => t.blocks[0]?.kind === 'shell' && t.blocks[0].output === null)
      .map((t) => t.id)
  )
  return after.turns.flatMap((t) => {
    const b = t.blocks[0]
    return running.has(t.id) && b?.kind === 'shell' && b.output !== null ? [b] : []
  })
}

/** Runs a `!` command in the session's folder: Claude Code echoes it, then its output. */
export const shellLine = (command: string, uuid: string) =>
  JSON.stringify({ command, type: 'bash_command', uuid })
