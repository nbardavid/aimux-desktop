// A chat's MCP servers, as Claude Code's `/mcp` shows them: asked of the running `claude` with
// control requests (`mcp_status`, `mcp_reconnect`, `mcp_toggle`, `mcp_authenticate`,
// `mcp_clear_auth`), answered by `control_response` lines the transcript never shows.

type Json = Record<string, unknown>
const obj = (v: unknown): Json => (typeof v === 'object' && v !== null ? (v as Json) : {})
const str = (v: unknown) => (typeof v === 'string' ? v : '')

/** The request ids of MCP requests, so their answers are told from the others. */
export const MCP = 'mcp-'

export type McpState = 'connected' | 'failed' | 'needs-auth' | 'pending' | 'disabled'

export interface McpServer {
  name: string
  state: McpState
  /** Tools it offers, when connected. */
  tools: number | null
  error: string | null
  /** Where it is configured (user, project, local, claude.ai…), when Claude Code says. */
  scope: string | null
  /** Reached over HTTP or SSE: the only kind that signs in, so the only kind to sign out. */
  remote: boolean
}

export type McpRequest =
  | { subtype: 'mcp_status' }
  | { subtype: 'mcp_reconnect'; serverName: string }
  | { subtype: 'mcp_toggle'; serverName: string; enabled: boolean }
  | { subtype: 'mcp_authenticate'; serverName: string }
  | { subtype: 'mcp_clear_auth'; serverName: string }

export type McpAction = 'reconnect' | 'enable' | 'disable' | 'authenticate' | 'sign-out'

export const ACTION_LABEL: Record<McpAction, string> = {
  'authenticate': 'Authenticate',
  'disable': 'Disable',
  'enable': 'Enable',
  'reconnect': 'Reconnect',
  'sign-out': 'Sign out',
}

const STATES = new Set<string>(['connected', 'failed', 'needs-auth', 'pending', 'disabled'])

export function parseMcpStatus(answer: Json): McpServer[] | null {
  if (!Array.isArray(answer.mcpServers)) return null
  return answer.mcpServers.map((s) => {
    const o = obj(s)
    const status = str(o.status)
    return {
      error: str(o.error) || null,
      name: str(o.name),
      remote: ['http', 'sse'].includes(str(obj(o.config).type)),
      scope: str(o.scope) || null,
      state: (STATES.has(status) ? status : 'pending') as McpState,
      tools: typeof o.toolCount === 'number' ? o.toolCount : null,
    }
  })
}

/**
 * What a server's row offers, its main action first (Enter runs it). A server that signed in
 * keeps "Sign out" while connected; one that needs auth offers nothing but signing in and off.
 */
export function actionsFor(s: McpServer): McpAction[] {
  switch (s.state) {
    case 'disabled':
      return ['enable']
    case 'needs-auth':
      return ['authenticate', 'disable']
    case 'failed':
      return ['reconnect', 'disable']
    case 'pending':
      return ['disable']
    case 'connected':
      return s.remote ? ['reconnect', 'disable', 'sign-out'] : ['reconnect', 'disable']
  }
}

export function actionRequest(action: McpAction, serverName: string): McpRequest {
  switch (action) {
    case 'reconnect':
      return { serverName, subtype: 'mcp_reconnect' }
    case 'enable':
    case 'disable':
      return { enabled: action === 'enable', serverName, subtype: 'mcp_toggle' }
    case 'authenticate':
      return { serverName, subtype: 'mcp_authenticate' }
    case 'sign-out':
      return { serverName, subtype: 'mcp_clear_auth' }
  }
}

export const mcpLine = (requestId: string, request: McpRequest) =>
  JSON.stringify({ request, request_id: requestId, type: 'control_request' })

/** A `control_response` to one of our MCP requests: its id and answer, or its error. */
export function mcpAnswer(
  line: string
):
  | { requestId: string; ok: true; answer: Json }
  | { requestId: string; ok: false; error: string }
  | null {
  if (!line.includes(MCP)) return null
  try {
    const m = obj(JSON.parse(line))
    if (m.type !== 'control_response') return null
    const response = obj(m.response)
    const requestId = str(response.request_id)
    if (!requestId.startsWith(MCP)) return null
    if (response.subtype === 'error')
      return { error: str(response.error) || 'Claude Code refused it', ok: false, requestId }
    return { answer: obj(response.response), ok: true, requestId }
  } catch {
    return null
  }
}

/** The authorization page `mcp_authenticate` hands back, when the user has to sign in. */
export const authUrl = (answer: Json): string | null => str(answer.authUrl) || null

export const STATE_LABEL: Record<McpState, string> = {
  'connected': 'Connected',
  'disabled': 'Disabled',
  'failed': 'Failed',
  'needs-auth': 'Needs sign-in',
  'pending': 'Connecting',
}
