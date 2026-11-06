// Claude Code's stream-json, folded into what a chat screen shows. Partial stream events
// draw text as it is written; the full messages that follow only fill in what streaming
// cannot give (a tool's parsed input, or a turn that was never streamed).

import { parseCommand } from './commands'

export type Block =
  | { kind: 'text'; text: string }
  /** A user turn that is a `/` command. */
  | { kind: 'command'; name: string; args: string }
  /** What a local command printed, shown as a card rather than as Claude's answer. */
  | { kind: 'output'; text: string }
  /** A faint line of the app's own: a model or effort picked outside the composer. */
  | { kind: 'note'; text: string }
  | { kind: 'thinking'; text: string }
  /** An image the user pasted with a prompt: base64, as sent to Claude. */
  | ({ kind: 'image' } & Image)
  | {
      kind: 'tool'
      id: string
      name: string
      input: Record<string, unknown>
      json: string
      result?: { text: string; isError: boolean }
      /** The turn ended (stopped, failed, or the session closed) before its result came. */
      stopped?: boolean
    }

/** A pasted image, as Claude takes it: `image/png`, `image/jpeg`, `image/gif` or `image/webp`. */
export interface Image {
  mediaType: string
  data: string
}

/** How an exchange ended: its price and length, or `stopped` when Esc ended it. */
export interface TurnEnd {
  /** Claude Code's API-price estimate; 0 when free or unknown (a replayed transcript). */
  costUsd: number
  /** 0 when unknown. */
  durationMs: number
  stopped: boolean
}

export interface Turn {
  role: 'user' | 'assistant'
  id: string
  blocks: Block[]
  /** On the last turn of a finished exchange (the prompt itself, when nothing answered). */
  end?: TurnEnd
}

export interface Permission {
  requestId: string
  /** The tool call it asks about: its row stays open while the question waits. */
  toolUseId: string
  toolName: string
  input: Record<string, unknown>
  description: string | null
  suggestions: unknown[]
}

export interface SlashCommand {
  name: string
  description: string
  argumentHint: string
  aliases: string[]
  builtin: boolean
}

export interface ChatState {
  sessionId: string | null
  model: string | null
  status: 'starting' | 'idle' | 'working' | 'exited'
  /**
   * Esc was pressed: the turn is being stopped, until its result arrives; or, when Claude
   * was running nothing, until it acknowledges the stop.
   */
  stopping: boolean
  turns: Turn[]
  /**
   * Prompts sent while Claude works: already written to it, shown above the composer until
   * Claude starts them (`command_lifecycle`). It takes every waiting prompt at once, at its
   * next tool call or next turn, so they join into one prompt; a slash command runs alone.
   */
  queued: Turn[]
  /** This Claude reports the prompts it starts (`command_lifecycle`; older ones do not). */
  tracks: boolean
  /** A prompt was started and its turn's result is not out yet. */
  running: boolean
  pending: Permission[]
  errors: string[]
  /** The commands this chat's Claude offers, from its `initialize` answer. */
  commands: SlashCommand[]
  /**
   * When the turn under way started (ms), for the live line's clock; null when this window
   * did not see it start (a chat reattached mid-turn).
   */
  startedAt: number | null
}

export const initialChat: ChatState = {
  commands: [],
  errors: [],
  model: null,
  pending: [],
  queued: [],
  running: false,
  sessionId: null,
  startedAt: null,
  status: 'starting',
  stopping: false,
  tracks: false,
  turns: [],
}

type Json = Record<string, unknown>

const obj = (v: unknown): Json => (typeof v === 'object' && v !== null ? (v as Json) : {})
const str = (v: unknown) => (typeof v === 'string' ? v : '')

/** The `commands` of Claude Code's `initialize` answer. */
export function parseCommands(json: unknown): SlashCommand[] {
  if (!Array.isArray(json)) return []
  return json.flatMap((raw) => {
    const c = obj(raw)
    if (typeof c.name !== 'string' || c.name === '') return []
    const aliases = Array.isArray(c.aliases)
      ? c.aliases.filter((a): a is string => typeof a === 'string')
      : []
    return [
      {
        aliases,
        argumentHint: str(c.argumentHint),
        builtin: c.builtin === true,
        description: str(c.description),
        name: c.name,
      },
    ]
  })
}

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
    // A local command answers with a `<synthetic>` message: its output, not Claude speaking.
    const prev = state.turns.at(-1)
    if (message.model === '<synthetic>') {
      const text = blocks.map((b) => (b.kind === 'text' ? b.text : '')).join('\n\n')
      const next = { ...state, model: modelSet(text) ?? state.model }
      // A change picked outside the composer already says so in its note.
      if (prev?.blocks[0]?.kind === 'note') return next
      if (prev?.role === 'user' && prev.blocks[0]?.kind === 'command') {
        return withTurn(next, id, (t) => ({ ...t, blocks: [{ kind: 'output', text }] }))
      }
    }
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
export function reduceLine(state: ChatState, line: string, now = Date.now()): ChatState {
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
      const response = obj(m.response)
      // A stop Claude acknowledged with nothing running: no result will end it, this does.
      // What was still queued is never answered: it reads as the last prompts.
      if (str(response.request_id).startsWith(STOP) && state.stopping && state.tracks) {
        if (state.running) return state
        let turns = state.turns
        for (const turn of state.queued) turns = joinPrompt(turns, turn)
        return { ...state, pending: [], queued: [], status: 'idle', stopping: false, turns }
      }
      // The answer to `initialize`: Claude is ready before its first turn says so.
      const answer = obj(response.response)
      const next = Array.isArray(answer.commands)
        ? { ...state, commands: parseCommands(answer.commands) }
        : state
      return next.status === 'starting' ? { ...next, status: 'idle' } : next
    }
    case 'stream_event': {
      return onStreamEvent({ ...state, status: 'working' }, obj(m.event))
    }
    case 'assistant': {
      return onAssistant(state, obj(m.message))
    }
    case 'command_lifecycle': {
      const tracked = { ...state, tracks: true }
      if (m.state !== 'started') return tracked
      return takePrompt({ ...tracked, running: true }, str(m.command_uuid))
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
        toolUseId: str(request.tool_use_id),
      }
      return { ...state, pending: [...state.pending, permission] }
    }
    case 'result': {
      const end = {
        costUsd: typeof m.total_cost_usd === 'number' ? m.total_cost_usd : 0,
        durationMs: typeof m.duration_ms === 'number' ? m.duration_ms : 0,
        stopped: state.stopping,
      }
      // A turn the user stopped ends as `error_during_execution`: asked for, not a failure.
      const failed = !state.stopping && (m.subtype !== 'success' || m.is_error === true)
      const errors = failed ? [...state.errors, str(m.result) || str(m.subtype)] : state.errors
      const ended = withEnd(stopTools(state), state.turns.length, end)
      if (!state.tracks && state.queued.length > 0) {
        // A Claude that never says when it takes them: its next turn, all together.
        let turns = ended.turns
        for (const turn of state.queued) turns = joinPrompt(turns, turn)
        return {
          ...ended,
          errors,
          pending: [],
          queued: [],
          running: false,
          startedAt: now,
          status: 'working',
          stopping: false,
          turns,
        }
      }
      // What is still queued is Claude's next turn: its start moves it into the transcript.
      // Its clock starts now.
      const next = state.queued.length > 0
      return {
        ...ended,
        errors,
        pending: [],
        running: false,
        startedAt: next ? now : null,
        status: next ? 'working' : 'idle',
        stopping: false,
      }
    }
    case 'aimux_stderr': {
      return { ...state, errors: [...state.errors, str(m.text)].slice(-20) }
    }
    case 'aimux_exit': {
      // What was queued was never answered: it reads as the last prompts.
      const turns = [...state.turns, ...state.queued]
      return {
        ...state,
        pending: [],
        queued: [],
        running: false,
        startedAt: null,
        status: 'exited',
        stopping: false,
        turns,
      }
    }
    case 'aimux_sent': {
      // What a window wrote to Claude, replayed to the next window: its prompts and answers.
      const sent = obj(m.message)
      if (sent.type === 'control_response')
        return resolvePermission(state, str(obj(sent.response).request_id))
      if (sent.type !== 'user') return state
      const content = obj(sent.message).content
      const text = promptText(content)
      const images = imagesOf(content)
      if (text === '' && images.length === 0) return state
      return sendTurn(state, text, str(sent.uuid) || `u${state.turns.length}`, images)
    }
    default: {
      return state
    }
  }
}

/** The turn is over: a tool call still without its result will never get one. */
function stopTools(state: ChatState): ChatState {
  const open = (b: Block) => b.kind === 'tool' && b.result === undefined && b.stopped !== true
  if (!state.turns.some((t) => t.blocks.some(open))) return state
  return {
    ...state,
    turns: state.turns.map((t) =>
      t.blocks.some(open)
        ? { ...t, blocks: t.blocks.map((b) => (open(b) ? { ...b, stopped: true } : b)) }
        : t
    ),
  }
}

const isNote = (turn: Turn | undefined) => turn?.blocks[0]?.kind === 'note'

/** Marks the exchange that ends before turn `upto` as over: on its last turn, notes aside. */
function withEnd(state: ChatState, upto: number, end: TurnEnd): ChatState {
  const at = state.turns.slice(0, upto).findLastIndex((t) => !isNote(t))
  if (at === -1) return state
  return { ...state, turns: state.turns.map((t, i) => (i === at ? { ...t, end } : t)) }
}

/** The model `/model` switched to, from what it printed ("Set model to Sonnet 5.5"). */
export function modelSet(text: string): string | null {
  const m = /^Set model to (.+)$/m.exec(text.replaceAll('*', ''))
  const name = m?.[1]?.replace(/\s*\(.*\)\s*$/, '').trim() ?? ''
  return name === '' ? null : name
}

// What Claude Code writes in the transcript when Esc stopped a turn.
const INTERRUPTED = /^\[Request interrupted by user/
const HARNESS_TEXT = /^<(command-|local-command-|system-reminder|bash-)/
const COMMAND_NAME = /<command-name>\/?([^<]+)<\/command-name>/
const COMMAND_ARGS = /<command-args>([\s\S]*?)<\/command-args>/
const STDOUT = /<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/
// oxlint-disable-next-line no-control-regex -- terminal colours in what a command printed
const ANSI = /\u001B\[[\d;]*m/g

/** How the transcript records a command and what it printed, as the chat shows them. */
function harnessTurn(state: ChatState, text: string, id: string): ChatState {
  const name = COMMAND_NAME.exec(text)?.[1]
  if (name !== undefined) {
    const args = (COMMAND_ARGS.exec(text)?.[1] ?? '').trim()
    const turn: Turn = { blocks: [{ args, kind: 'command', name }], id, role: 'user' }
    return { ...state, turns: [...state.turns, turn] }
  }
  const out = (STDOUT.exec(text)?.[1] ?? '').replaceAll(ANSI, '').trim()
  if (out === '') return state
  const turn: Turn = { blocks: [{ kind: 'output', text: out }], id, role: 'assistant' }
  return { ...state, model: modelSet(out) ?? state.model, turns: [...state.turns, turn] }
}

/** The images of a user message's content (not those inside a tool's result). */
function imagesOf(content: unknown): Image[] {
  if (!Array.isArray(content)) return []
  return content.flatMap((raw) => {
    const part = obj(raw)
    const source = obj(part.source)
    if (part.type !== 'image' || source.type !== 'base64') return []
    return [{ data: str(source.data), mediaType: str(source.media_type) }]
  })
}

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
  // The exchange being read: when its prompt was written, when its last line was, and
  // whether Esc stopped it. Each ends where the next prompt starts; its cost is unknown.
  let open = false
  let start = Number.NaN
  let last = Number.NaN
  let stopped = false
  const close = (s: ChatState, upto: number) => {
    const durationMs = Number.isNaN(last - start) ? 0 : Math.max(0, last - start)
    return open ? withEnd(s, upto, { costUsd: 0, durationMs, stopped }) : s
  }
  for (const line of lines) {
    let m: Json
    try {
      m = obj(JSON.parse(line))
    } catch {
      continue
    }
    if (m.isSidechain === true || m.isMeta === true) continue
    const message = obj(m.message)
    const uuid = str(m.uuid) || `u${state.turns.length}`
    const before = state.turns.length
    if (m.type === 'system' && m.subtype === 'local_command') {
      state = harnessTurn(state, str(m.content), uuid)
    } else if (m.type === 'assistant') {
      const id = str(message.id)
      const content = Array.isArray(message.content) ? message.content : []
      const blocks = content.map(blockOf).filter((b): b is Block => b !== null)
      state = withTurn(state, id, (t) => ({ ...t, blocks: [...t.blocks, ...blocks] }))
    } else if (m.type === 'user') {
      const text = promptText(message.content)
      if (INTERRUPTED.test(text)) stopped = true
      else if (HARNESS_TEXT.test(text)) state = harnessTurn(state, text, uuid)
      else {
        const images = imagesOf(message.content)
        if (text !== '' || images.length > 0) state = addUserTurn(state, text, uuid, images)
      }
      state = onUser(state, message)
    }
    const ts = Date.parse(str(m.timestamp))
    if (state.turns.length > before && state.turns.at(-1)?.role === 'user') {
      state = close(state, before)
      open = true
      start = ts
      stopped = false
    }
    if (!Number.isNaN(ts)) last = ts
  }
  // The process that wrote it is gone: what it left running was stopped.
  state = close(stopTools(state), state.turns.length)
  return { ...state, sessionId: null, status: 'starting' }
}

/** The local echo of what the user sent, shown before Claude answers. */
export function addUserTurn(
  state: ChatState,
  text: string,
  id: string,
  images: readonly Image[] = []
): ChatState {
  const command = images.length === 0 ? parseCommand(text) : null
  const pictures = images.map((image): Block => ({ kind: 'image', ...image }))
  let blocks: Block[] = pictures
  if (command) blocks = [{ kind: 'command', ...command }]
  else if (text !== '') blocks = [...pictures, { kind: 'text', text }]
  return {
    ...state,
    status: 'working',
    turns: [...state.turns, { blocks, id, role: 'user' }],
  }
}

const isText = (t: Turn) => t.blocks.every((b) => b.kind === 'text')
const textOf = (t: Turn) => t.blocks.map((b) => (b.kind === 'text' ? b.text : '')).join('')

/**
 * Prompts Claude took together read as one: a text prompt joins the prompt just before it
 * when nothing answered that one yet. A command stays on its own, as Claude runs it.
 */
export function joinPrompt(turns: Turn[], turn: Turn): Turn[] {
  const last = turns.at(-1)
  if (last?.role !== 'user' || last.end || !isText(last) || !isText(turn)) return [...turns, turn]
  const text = `${textOf(last)}\n\n${textOf(turn)}`
  return [...turns.slice(0, -1), { ...last, blocks: [{ kind: 'text', text }] }]
}

/** Claude started a queued prompt (`command_lifecycle`, by uuid): it joins the transcript. */
function takePrompt(state: ChatState, uuid: string): ChatState {
  const turn = state.queued.find((t) => t.id === uuid)
  if (!turn) return state
  const queued = state.queued.filter((t) => t !== turn)
  return { ...state, queued, status: 'working', turns: joinPrompt(state.turns, turn) }
}

/** A prompt sent: in the transcript, or queued while Claude works on the one before. */
export function sendTurn(
  state: ChatState,
  text: string,
  id: string,
  images: readonly Image[] = []
): ChatState {
  if (state.status !== 'working') return addUserTurn(state, text, id, images)
  const turn = addUserTurn(state, text, id, images).turns.at(-1) as Turn
  return { ...state, queued: [...state.queued, turn] }
}

/**
 * A model or effort picked outside the composer: one faint line, no bubble. Claude's own
 * answer to it (a `<synthetic>` output) is then dropped; a second change of the same kind
 * replaces the line.
 */
export function addNote(state: ChatState, text: string, id: string): ChatState {
  const kind = text.split(' → ')[0] ?? text
  const last = state.turns.at(-1)
  const block = last?.blocks[0]
  const turns =
    block?.kind === 'note' && block.text.startsWith(`${kind} → `)
      ? state.turns.slice(0, -1)
      : state.turns
  return {
    ...state,
    turns: [...turns, { blocks: [{ kind: 'note', text }], id, role: 'assistant' }],
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

/** The request ids of stops, so their acknowledgement is told from other answers. */
export const STOP = 'stop-'

export const interruptLine = (requestId: string) =>
  JSON.stringify({
    request: { subtype: 'interrupt' },
    request_id: requestId,
    type: 'control_request',
  })

/** `uuid` comes back on Claude's `command_lifecycle` events as it queues and starts it. */
export const userLine = (
  text: string,
  sessionId: string | null,
  uuid?: string,
  images: readonly Image[] = []
) =>
  JSON.stringify({
    message: {
      content: [
        ...images.map((i) => ({
          source: { data: i.data, media_type: i.mediaType, type: 'base64' },
          type: 'image',
        })),
        ...(text === '' ? [] : [{ text, type: 'text' }]),
      ],
      role: 'user',
    },
    parent_tool_use_id: null,
    session_id: sessionId ?? '',
    type: 'user',
    ...(uuid !== undefined && { uuid }),
  })

/** One of AskUserQuestion's questions: Claude waits on the user's pick. */
export interface Question {
  question: string
  header: string
  options: { label: string; description: string }[]
  multiSelect: boolean
}

/** The questions a permission asks, when it is AskUserQuestion's; null for any other tool. */
export function questionsOf(p: Permission): Question[] | null {
  if (p.toolName !== 'AskUserQuestion' || !Array.isArray(p.input.questions)) return null
  return p.input.questions.map((raw) => {
    const q = obj(raw)
    const options = Array.isArray(q.options) ? q.options.map(obj) : []
    return {
      header: str(q.header),
      multiSelect: q.multiSelect === true,
      options: options.map((o) => ({ description: str(o.description), label: str(o.label) })),
      question: str(q.question),
    }
  })
}

/**
 * The answer to a permission. AskUserQuestion's picks go back in its input, as `answers`
 * keyed by question text (several labels joined by ", "): Claude reads them from there.
 */
export function permissionLine(
  p: Permission,
  answer: 'allow' | 'always' | 'deny',
  answers?: Record<string, string>
) {
  const response =
    answer === 'deny'
      ? { behavior: 'deny', message: 'The user declined this action.' }
      : {
          behavior: 'allow',
          updatedInput: answers ? { ...p.input, answers } : p.input,
          ...(answer === 'always' ? { updatedPermissions: p.suggestions } : {}),
        }
  return JSON.stringify({
    response: { request_id: p.requestId, response, subtype: 'success' },
    type: 'control_response',
  })
}

/** One line saying what a tool call does, for its collapsed row. */
const rel = (path: string, cwd: string) =>
  path.startsWith(`${cwd}/`) ? path.slice(cwd.length + 1) : path

export function toolSummary(name: string, input: Record<string, unknown>, cwd: string): string {
  const pick = {
    AskUserQuestion: Array.isArray(input.questions) ? str(obj(input.questions[0]).question) : '',
    Bash: str(input.command),
    Edit: rel(str(input.file_path), cwd),
    Glob: str(input.pattern),
    Grep: str(input.pattern),
    MultiEdit: rel(str(input.file_path), cwd),
    NotebookEdit: rel(str(input.notebook_path), cwd),
    Read: rel(str(input.file_path), cwd),
    Task: str(input.description),
    WebFetch: str(input.url),
    WebSearch: str(input.query),
    Write: rel(str(input.file_path), cwd),
  }[name]
  if (pick !== undefined) return pick
  const first = Object.values(input).find((v) => typeof v === 'string')
  return typeof first === 'string' ? first : ''
}

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

// The transcript as it reads: exchanges, their tool calls folded into one row.

/** A block with a key that stays the same while it streams and once it is folded. */
export interface Keyed {
  key: string
  block: Block
}

export type Item =
  /** Shown as it is: the answer, a streaming message, a command's output, a note. */
  | ({ kind: 'block' } & Keyed)
  /** One row for a run of work. Its last `shown` blocks stay visible while it is folded. */
  | { kind: 'group'; key: string; blocks: Keyed[]; shown: number }

/** A prompt and every assistant turn up to the next one. */
export interface Exchange {
  key: string
  user: Turn | null
  /** Every assistant block, in order, for the footer's file chips. */
  blocks: Block[]
  items: Item[]
  end: TurnEnd | null
  live: boolean
  /** What its Copy copies: the answer, or what a command printed. */
  answer: string
}

const shownBlock = (b: Block) =>
  b.kind !== 'command' && (b.kind !== 'thinking' || b.text.trim() !== '')

/** Folds an exchange's blocks: runs of work become groups; `apart` blocks stay out. */
function fold(blocks: Keyed[], apart: (k: Keyed, i: number) => boolean): Item[] {
  const items: Item[] = []
  let run: Keyed[] = []
  const flush = () => {
    const first = run[0]
    if (first) items.push({ blocks: run, key: `g:${first.key}`, kind: 'group', shown: 0 })
    run = []
  }
  for (const [i, k] of blocks.entries()) {
    if (apart(k, i) || k.block.kind === 'output' || k.block.kind === 'note') {
      flush()
      items.push({ kind: 'block', ...k })
    } else run.push(k)
  }
  flush()
  return items
}

/**
 * The collapse rule. Finished: the last message is the answer; what came before it folds
 * into one row above it, what came after (a stopped turn's tools) into one row below.
 * Live: everything folds as it goes (the live line says what the newest tool does), except
 * a tool whose permission is asked, and the message being written after it.
 */
function itemsOf(blocks: Keyed[], live: boolean, asked: ReadonlySet<string>): Item[] {
  if (!live) {
    const answer = blocks.findLastIndex((k) => k.block.kind === 'text')
    return fold(blocks, (_, i) => i === answer)
  }
  const tool = blocks.findLastIndex((k) => k.block.kind === 'tool')
  const newest = blocks[tool]
  const tail = blocks.slice(tool + 1).filter((k) => k.block.kind === 'text')
  const items = fold(blocks.slice(0, Math.max(tool, 0)), () => false)
  if (newest) {
    // The live line says what it does; a question about it shows it, to answer it.
    const shown = newest.block.kind === 'tool' && asked.has(newest.block.id) ? 1 : 0
    const group = items.at(-1)
    if (group?.kind === 'group')
      items[items.length - 1] = { ...group, blocks: [...group.blocks, newest], shown }
    else items.push({ blocks: [newest], key: `g:${newest.key}`, kind: 'group', shown })
  }
  return [...items, ...tail.map((k): Item => ({ kind: 'block', ...k }))]
}

/** A tool call still waiting: for its result, or for an answer to its permission. */
const openTool = (b: Block, asked: ReadonlySet<string>) =>
  b.kind === 'tool' && b.stopped !== true && (b.result === undefined || asked.has(b.id))

/**
 * The turns as exchanges. A note stands alone; `working` makes the last one live, and so
 * does a tool still waiting (on its result, or on `asked`: the tool ids of pending questions).
 */
export function exchanges(
  turns: readonly Turn[],
  working: boolean,
  asked: ReadonlySet<string> = new Set()
): Exchange[] {
  const runs: Turn[][] = []
  for (const [i, turn] of turns.entries()) {
    const run = runs.at(-1)
    if (run && turn.role !== 'user' && !isNote(turn) && !isNote(turns[i - 1])) run.push(turn)
    else runs.push([turn])
  }
  return runs.map((run, i) => {
    const first = run[0] as Turn
    const user = first.role === 'user' ? first : null
    const said = run.filter((t) => t.role === 'assistant')
    const keyed = said.flatMap((t) =>
      t.blocks.flatMap((block, at) => (shownBlock(block) ? [{ block, key: `${t.id}:${at}` }] : []))
    )
    const end = run.findLast((t) => t.end !== undefined)?.end ?? null
    const live =
      (working && i === runs.length - 1 && end === null) ||
      keyed.some((k) => openTool(k.block, asked))
    const texts = (kind: Block['kind']) =>
      keyed.flatMap((k) => (k.block.kind === kind && 'text' in k.block ? [k.block.text] : []))
    const answer = texts('text').at(-1) ?? texts('output').join('\n\n')
    return {
      answer: answer.trim(),
      blocks: keyed.map((k) => k.block),
      end,
      items: itemsOf(keyed, live, asked),
      key: first.id,
      live,
      user,
    }
  })
}

/** What a tool's row icon says it did. */
export type ToolKind = 'read' | 'bash' | 'edit' | 'web' | 'agent' | 'thinking'

export function toolKind(block: Block): ToolKind | null {
  if (block.kind === 'thinking') return 'thinking'
  if (block.kind !== 'tool') return null
  const kinds: Record<string, ToolKind> = {
    Agent: 'agent',
    Bash: 'bash',
    Edit: 'edit',
    Glob: 'read',
    Grep: 'read',
    LS: 'read',
    MultiEdit: 'edit',
    NotebookEdit: 'edit',
    Read: 'read',
    Task: 'agent',
    WebFetch: 'web',
    WebSearch: 'web',
    Write: 'edit',
  }
  return kinds[block.name] ?? null
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** What one kind of work adds to a group's sentence, from its calls. */
const CLAUSES: Record<string, (calls: Block[]) => string> = {
  agent: (c) => `ran ${plural(c.length, 'agent')}`,
  bash: (c) => `ran ${plural(c.length, 'command')}`,
  edit: (c) => `edited ${plural(distinctPaths(c), 'file')}`,
  other: (c) => `used ${plural(c.length, 'other tool')}`,
  read: (c) => `read ${plural(distinctPaths(c), 'file')}`,
  search: () => 'searched the code',
  web: () => 'searched the web',
}

const pathOf = (b: Block) =>
  b.kind === 'tool' ? str(b.input.file_path) || str(b.input.notebook_path) || b.id : ''
const distinctPaths = (calls: Block[]) => new Set(calls.map(pathOf)).size

/** The clause a tool call counts under: Glob and Grep search, Read reads. */
function clauseOf(b: Block): string {
  if (b.kind !== 'tool') return ''
  if (b.name === 'Glob' || b.name === 'Grep' || b.name === 'LS') return 'search'
  return toolKind(b) ?? 'other'
}

/**
 * A group row's label, as a sentence of what was done ("Read 6 files, ran 4 commands"), in
 * the order it was first done; its failures apart.
 */
export function groupSummary(blocks: readonly Block[]) {
  const tools = blocks.filter((b) => b.kind === 'tool')
  const byClause = new Map<string, Block[]>()
  for (const b of tools) {
    const clause = clauseOf(b)
    byClause.set(clause, [...(byClause.get(clause) ?? []), b])
  }
  const said = [...byClause].map(([clause, calls]) => CLAUSES[clause]?.(calls) ?? '')
  const messages = blocks.filter((b) => b.kind === 'text').length
  let label = said.join(', ')
  if (label === '') label = messages > 0 ? plural(messages, 'message') : 'Thought'
  return {
    failed: tools.filter((b) => b.result?.isError === true).length,
    label: label.charAt(0).toUpperCase() + label.slice(1),
  }
}

/** What a running tool is doing, for the live line: a verb, and what it acts on. */
const STEP: Record<string, string> = {
  Agent: 'Running an agent',
  Bash: 'Running',
  Edit: 'Editing',
  Glob: 'Searching for',
  Grep: 'Searching for',
  MultiEdit: 'Editing',
  NotebookEdit: 'Editing',
  Read: 'Reading',
  Task: 'Running an agent',
  WebFetch: 'Fetching',
  WebSearch: 'Searching the web for',
  Write: 'Writing',
}

/**
 * What Claude is doing now, for the live line under the transcript: the tool it runs and on
 * what ("Reading src/app.tsx"), or that it thinks, or works.
 */
export function liveStep(state: ChatState, cwd: string): { verb: string; target: string } {
  if (state.stopping) return { target: '', verb: 'Stopping' }
  if (state.status === 'starting') return { target: '', verb: 'Starting Claude' }
  const last = state.turns.at(-1)
  const block = last?.role === 'assistant' ? last.blocks.at(-1) : undefined
  if (block?.kind === 'thinking') return { target: '', verb: 'Thinking' }
  if (block?.kind === 'tool' && block.result === undefined && block.stopped !== true) {
    const verb = STEP[block.name]
    if (verb === undefined) return { target: '', verb: `Using ${block.name}` }
    const target =
      block.name === 'Agent' || block.name === 'Task'
        ? ''
        : toolSummary(block.name, block.input, cwd)
    return { target: target.split('\n')[0] ?? '', verb }
  }
  return { target: '', verb: 'Working' }
}

export interface ChangedFile {
  /** Relative to the workspace when inside it. */
  path: string
  added: number
  removed: number
}

const lineCount = (v: unknown) => {
  const text = str(v)
  return text === '' ? 0 : text.replace(/\n$/, '').split('\n').length
}

/** The files an exchange's Edit, Write, MultiEdit and NotebookEdit calls changed, by path. */
export function changedFiles(blocks: readonly Block[], cwd: string): ChangedFile[] {
  const files = new Map<string, ChangedFile>()
  for (const b of blocks) {
    if (b.kind !== 'tool' || b.result?.isError === true) continue
    const { input, name } = b
    let counts: [number, number] | null = null
    if (name === 'Edit') counts = [lineCount(input.new_string), lineCount(input.old_string)]
    else if (name === 'Write') counts = [lineCount(input.content), 0]
    else if (name === 'NotebookEdit') counts = [lineCount(input.new_source), 0]
    else if (name === 'MultiEdit' && Array.isArray(input.edits)) {
      const edits = input.edits.map(obj)
      counts = [
        edits.reduce((n, e) => n + lineCount(e.new_string), 0),
        edits.reduce((n, e) => n + lineCount(e.old_string), 0),
      ]
    }
    const path = rel(str(input.file_path) || str(input.notebook_path), cwd)
    if (counts === null || path === '') continue
    const file = files.get(path) ?? { added: 0, path, removed: 0 }
    files.set(path, { ...file, added: file.added + counts[0], removed: file.removed + counts[1] })
  }
  return [...files.values()]
}

/** Every block of a chat, in order. */
export const blocksOf = (state: ChatState): Block[] => state.turns.flatMap((t) => t.blocks)

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

/** "12s", "2m 4s", "1h 3m". */
export function formatDuration(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}
