// Claude Code's stream-json, folded into what a chat screen shows. Partial stream events
// draw text as it is written; the full messages that follow only fill in what streaming
// cannot give (a tool's parsed input, or a turn that was never streamed).

export type Block =
  | { kind: 'text'; text: string }
  | { kind: 'thinking'; text: string }
  | {
      kind: 'tool'
      id: string
      name: string
      input: Record<string, unknown>
      json: string
      result?: { text: string; isError: boolean }
    }

export interface Turn {
  role: 'user' | 'assistant'
  id: string
  blocks: Block[]
}

export interface Permission {
  requestId: string
  toolName: string
  input: Record<string, unknown>
  description: string | null
  suggestions: unknown[]
}

export interface ChatState {
  sessionId: string | null
  model: string | null
  status: 'starting' | 'idle' | 'working' | 'exited'
  turns: Turn[]
  pending: Permission[]
  lastTurn: { costUsd: number; durationMs: number } | null
  errors: string[]
}

export const initialChat: ChatState = {
  errors: [],
  lastTurn: null,
  model: null,
  pending: [],
  sessionId: null,
  status: 'starting',
  turns: [],
}

type Json = Record<string, unknown>

const obj = (v: unknown): Json => (typeof v === 'object' && v !== null ? (v as Json) : {})
const str = (v: unknown) => (typeof v === 'string' ? v : '')

function resultText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => str(obj(part).text))
    .filter((t) => t !== '')
    .join('\n')
}

function blockOf(raw: unknown): Block | null {
  const b = obj(raw)
  if (b.type === 'text') return { kind: 'text', text: str(b.text) }
  if (b.type === 'thinking') return { kind: 'thinking', text: str(b.thinking) }
  if (b.type === 'tool_use') {
    return { id: str(b.id), input: obj(b.input), json: '', kind: 'tool', name: str(b.name) }
  }
  return null
}

function withTurn(state: ChatState, id: string, edit: (turn: Turn) => Turn): ChatState {
  const at = state.turns.findIndex((t) => t.id === id)
  const turns =
    at === -1
      ? [...state.turns, edit({ blocks: [], id, role: 'assistant' })]
      : state.turns.map((t, i) => (i === at ? edit(t) : t))
  return { ...state, turns }
}

function editTool(state: ChatState, toolId: string, edit: (b: Block & { kind: 'tool' }) => Block) {
  return {
    ...state,
    turns: state.turns.map((turn) => ({
      ...turn,
      blocks: turn.blocks.map((b) => (b.kind === 'tool' && b.id === toolId ? edit(b) : b)),
    })),
  }
}

/** The assistant turn being streamed: the last one, named by `message_start`. */
function streaming(state: ChatState) {
  return state.turns.findLast((t) => t.role === 'assistant')
}

function onStreamEvent(state: ChatState, event: Json): ChatState {
  if (event.type === 'message_start') {
    const id = str(obj(event.message).id)
    return withTurn(state, id, (t) => t)
  }
  const turn = streaming(state)
  if (!turn) return state
  const index = typeof event.index === 'number' ? event.index : -1
  if (event.type === 'content_block_start') {
    const block = blockOf(event.content_block)
    if (!block) return state
    return withTurn(state, turn.id, (t) => {
      const blocks = [...t.blocks]
      blocks[index] = block
      return { ...t, blocks }
    })
  }
  if (event.type === 'content_block_delta') {
    const delta = obj(event.delta)
    return withTurn(state, turn.id, (t) => ({
      ...t,
      blocks: t.blocks.map((b, i) => {
        if (i !== index) return b
        if (b.kind === 'text' && delta.type === 'text_delta')
          return { ...b, text: b.text + str(delta.text) }
        if (b.kind === 'thinking' && delta.type === 'thinking_delta')
          return { ...b, text: b.text + str(delta.thinking) }
        if (b.kind === 'tool' && delta.type === 'input_json_delta')
          return { ...b, json: b.json + str(delta.partial_json) }
        return b
      }),
    }))
  }
  if (event.type === 'content_block_stop') {
    // Fallback for a tool whose full message never arrives: parse what was streamed.
    return withTurn(state, turn.id, (t) => ({
      ...t,
      blocks: t.blocks.map((b, i) => {
        if (i !== index || b.kind !== 'tool' || b.json === '' || Object.keys(b.input).length > 0)
          return b
        try {
          return { ...b, input: obj(JSON.parse(b.json)) }
        } catch {
          return b
        }
      }),
    }))
  }
  return state
}

function onAssistant(state: ChatState, message: Json): ChatState {
  const id = str(message.id)
  const content = Array.isArray(message.content) ? message.content : []
  const known = state.turns.find((t) => t.id === id)
  if (!known) {
    const blocks = content.map(blockOf).filter((b): b is Block => b !== null)
    return withTurn(state, id, (t) => ({ ...t, blocks }))
  }
  let next = state
  for (const raw of content) {
    const block = blockOf(raw)
    if (block?.kind === 'tool')
      next = editTool(next, block.id, (b) => ({ ...b, input: block.input }))
  }
  return next
}

function onUser(state: ChatState, message: Json): ChatState {
  const content = Array.isArray(message.content) ? message.content : []
  let next = state
  for (const raw of content) {
    const part = obj(raw)
    if (part.type !== 'tool_result') continue
    const result = { isError: part.is_error === true, text: resultText(part.content) }
    next = editTool(next, str(part.tool_use_id), (b) => ({ ...b, result }))
  }
  return next
}

/** Folds one line of Claude Code's stdout (or the host's `aimux_*` lines) into the chat. */
export function reduceLine(state: ChatState, line: string): ChatState {
  let m: Json
  try {
    m = obj(JSON.parse(line))
  } catch {
    return state
  }
  // A sub-agent's traffic belongs to its Task tool row, not to the conversation.
  if (m.parent_tool_use_id !== undefined && m.parent_tool_use_id !== null) return state
  switch (m.type) {
    case 'system': {
      if (m.subtype === 'init') {
        return {
          ...state,
          model: str(m.model) || null,
          sessionId: str(m.session_id) || null,
          status: 'idle',
        }
      }
      if (m.subtype === 'status' && m.status === 'requesting')
        return { ...state, status: 'working' }
      return state
    }
    case 'control_response': {
      // The answer to `initialize`: Claude is ready before its first turn says so.
      return state.status === 'starting' ? { ...state, status: 'idle' } : state
    }
    case 'stream_event': {
      return onStreamEvent({ ...state, status: 'working' }, obj(m.event))
    }
    case 'assistant': {
      return onAssistant(state, obj(m.message))
    }
    case 'user': {
      return onUser(state, obj(m.message))
    }
    case 'control_request': {
      const request = obj(m.request)
      if (request.subtype !== 'can_use_tool') return state
      const permission: Permission = {
        description: str(request.description) || null,
        input: obj(request.input),
        requestId: str(m.request_id),
        suggestions: Array.isArray(request.permission_suggestions)
          ? request.permission_suggestions
          : [],
        toolName: str(request.tool_name),
      }
      return { ...state, pending: [...state.pending, permission] }
    }
    case 'result': {
      const lastTurn = {
        costUsd: typeof m.total_cost_usd === 'number' ? m.total_cost_usd : 0,
        durationMs: typeof m.duration_ms === 'number' ? m.duration_ms : 0,
      }
      const failed = m.subtype !== 'success' || m.is_error === true
      const errors = failed ? [...state.errors, str(m.result) || str(m.subtype)] : state.errors
      return { ...state, errors, lastTurn, pending: [], status: 'idle' }
    }
    case 'aimux_stderr': {
      return { ...state, errors: [...state.errors, str(m.text)].slice(-20) }
    }
    case 'aimux_exit': {
      return { ...state, pending: [], status: 'exited' }
    }
    case 'aimux_sent': {
      // What a window wrote to Claude, replayed to the next window: its prompts and answers.
      const sent = obj(m.message)
      if (sent.type === 'control_response')
        return resolvePermission(state, str(obj(sent.response).request_id))
      const text = sent.type === 'user' ? promptText(obj(sent.message).content) : ''
      return text === ''
        ? state
        : addUserTurn(state, text, str(sent.uuid) || `u${state.turns.length}`)
    }
    default: {
      return state
    }
  }
}

const HARNESS_TEXT = /^<(command-|local-command-|system-reminder|bash-)/

function promptText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => (obj(part).type === 'text' ? str(obj(part).text) : ''))
    .filter((t) => t !== '')
    .join('\n')
}

/**
 * A chat rebuilt from the transcript Claude Code keeps on disk, for a tab reopened after a
 * restart: the prompts, the answers, the tool calls with their results. The transcript
 * writes one line per content block, so blocks of one message are joined back.
 */
export function replayTranscript(lines: readonly string[]): ChatState {
  let state = initialChat
  for (const line of lines) {
    let m: Json
    try {
      m = obj(JSON.parse(line))
    } catch {
      continue
    }
    if (m.isSidechain === true || m.isMeta === true) continue
    const message = obj(m.message)
    if (m.type === 'assistant') {
      const id = str(message.id)
      const content = Array.isArray(message.content) ? message.content : []
      const blocks = content.map(blockOf).filter((b): b is Block => b !== null)
      state = withTurn(state, id, (t) => ({ ...t, blocks: [...t.blocks, ...blocks] }))
    } else if (m.type === 'user') {
      const text = promptText(message.content)
      if (text !== '' && !HARNESS_TEXT.test(text)) {
        state = { ...addUserTurn(state, text, str(m.uuid) || `u${state.turns.length}`) }
      }
      state = onUser(state, message)
    }
  }
  return { ...state, sessionId: null, status: 'starting' }
}

/** The local echo of what the user sent, shown before Claude answers. */
export function addUserTurn(state: ChatState, text: string, id: string): ChatState {
  return {
    ...state,
    status: 'working',
    turns: [...state.turns, { blocks: [{ kind: 'text', text }], id, role: 'user' }],
  }
}

export function resolvePermission(state: ChatState, requestId: string): ChatState {
  return { ...state, pending: state.pending.filter((p) => p.requestId !== requestId) }
}

// Lines for Claude Code's stdin.

export const initializeLine = (requestId: string) =>
  JSON.stringify({
    request: { subtype: 'initialize' },
    request_id: requestId,
    type: 'control_request',
  })

export const interruptLine = (requestId: string) =>
  JSON.stringify({
    request: { subtype: 'interrupt' },
    request_id: requestId,
    type: 'control_request',
  })

export const userLine = (text: string, sessionId: string | null) =>
  JSON.stringify({
    message: { content: [{ text, type: 'text' }], role: 'user' },
    parent_tool_use_id: null,
    session_id: sessionId ?? '',
    type: 'user',
  })

export function permissionLine(p: Permission, answer: 'allow' | 'always' | 'deny') {
  const response =
    answer === 'deny'
      ? { behavior: 'deny', message: 'The user declined this action.' }
      : {
          behavior: 'allow',
          updatedInput: p.input,
          ...(answer === 'always' ? { updatedPermissions: p.suggestions } : {}),
        }
  return JSON.stringify({
    response: { request_id: p.requestId, response, subtype: 'success' },
    type: 'control_response',
  })
}

/** One line saying what a tool call does, for its collapsed row. */
export function toolSummary(name: string, input: Record<string, unknown>, cwd: string): string {
  const rel = (path: string) => (path.startsWith(`${cwd}/`) ? path.slice(cwd.length + 1) : path)
  const pick = {
    Bash: str(input.command),
    Edit: rel(str(input.file_path)),
    Glob: str(input.pattern),
    Grep: str(input.pattern),
    MultiEdit: rel(str(input.file_path)),
    NotebookEdit: rel(str(input.notebook_path)),
    Read: rel(str(input.file_path)),
    Task: str(input.description),
    WebFetch: str(input.url),
    WebSearch: str(input.query),
    Write: rel(str(input.file_path)),
  }[name]
  if (pick !== undefined) return pick
  const first = Object.values(input).find((v) => typeof v === 'string')
  return typeof first === 'string' ? first : ''
}
