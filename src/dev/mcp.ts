// The preview's MCP servers for `/mcp`: one in each state, changed by the panel's actions.
// Reconnecting `flaky` fails once (the row's error), then works; signing in to `linear`
// "opens" a browser and lands about three seconds later.

interface Server {
  name: string
  status: string
  toolCount?: number
  error?: string
  scope: string
  config: { type: string }
}

const start = (): Server[] => [
  { config: { type: 'stdio' }, name: 'logit', scope: 'dynamic', status: 'connected', toolCount: 6 },
  { config: { type: 'http' }, name: 'github', scope: 'user', status: 'connected', toolCount: 41 },
  { config: { type: 'http' }, name: 'linear', scope: 'user', status: 'needs-auth' },
  {
    config: { type: 'stdio' },
    error: 'spawn npx ENOENT: the command was not found on PATH',
    name: 'flaky',
    scope: 'project',
    status: 'failed',
  },
  { config: { type: 'stdio' }, name: 'postgres', scope: 'local', status: 'pending' },
  { config: { type: 'stdio' }, name: 'filesystem', scope: 'user', status: 'disabled' },
]

let servers = start()
let flakyTries = 0

const ok = (requestId: string, response: unknown) =>
  JSON.stringify({
    response: { request_id: requestId, response, subtype: 'success' },
    type: 'control_response',
  })
const fail = (requestId: string, error: string) =>
  JSON.stringify({
    response: { error, request_id: requestId, subtype: 'error' },
    type: 'control_response',
  })

const set = (name: string, change: Partial<Server>) => {
  servers = servers.map((s) => (s.name === name ? { ...s, ...change } : s))
}

/** The answer to one of `/mcp`'s requests, and how long it takes; null for any other. */
export function mcpAnswer(
  requestId: string,
  request: { subtype?: string; serverName?: string; enabled?: boolean }
): { line: string; delay: number } | null {
  const name = request.serverName ?? ''
  const tools = name === 'filesystem' ? 12 : 8
  switch (request.subtype) {
    case 'mcp_status':
      if (new URLSearchParams(location.search).has('no-mcp'))
        return { delay: 400, line: ok(requestId, { mcpServers: [] }) }
      return { delay: 400, line: ok(requestId, { mcpServers: servers }) }
    case 'mcp_reconnect':
      if (name === 'flaky' && flakyTries++ === 0)
        return { delay: 1200, line: fail(requestId, 'Server exited with code 127 while starting') }
      set(name, { error: undefined, status: 'connected', toolCount: tools })
      return { delay: 1200, line: ok(requestId, {}) }
    case 'mcp_toggle':
      set(
        name,
        request.enabled === true
          ? { status: 'connected', toolCount: tools }
          : { status: 'disabled', toolCount: undefined }
      )
      return { delay: 700, line: ok(requestId, {}) }
    case 'mcp_authenticate':
      setTimeout(() => set(name, { status: 'connected', toolCount: 23 }), 3000)
      return {
        delay: 500,
        line: ok(requestId, {
          authUrl: `https://example.com/oauth/authorize?server=${name}`,
          requiresUserAction: true,
        }),
      }
    case 'mcp_clear_auth':
      set(name, { status: 'needs-auth', toolCount: undefined })
      return { delay: 600, line: ok(requestId, {}) }
    default:
      return null
  }
}
