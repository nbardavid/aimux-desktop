// Claude Code's own breakdown of a chat's context: what `get_context_usage` answers.

type Json = Record<string, unknown>
const obj = (v: unknown): Json => (typeof v === 'object' && v !== null ? (v as Json) : {})
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/** What fills the context, by Claude Code's categories (`/context`). */
export interface ContextUsage {
  /** In Claude Code's order; `deferred` ones are listed but only loaded on use. */
  categories: { name: string; tokens: number; deferred: boolean }[]
  mcpTools: { name: string; server: string; tokens: number; loaded: boolean }[]
  total: number
  max: number
}

/** The request ids of context breakdowns, so their answer is told from other answers. */
export const USAGE = 'usage-'

export function parseUsage(r: Json): ContextUsage | null {
  if (!Array.isArray(r.categories) || typeof r.maxTokens !== 'number') return null
  return {
    categories: r.categories.map((c) => {
      const o = obj(c)
      return { deferred: o.isDeferred === true, name: str(o.name), tokens: num(o.tokens) }
    }),
    max: num(r.maxTokens),
    mcpTools: (Array.isArray(r.mcpTools) ? r.mcpTools : []).map((t) => {
      const o = obj(t)
      return {
        loaded: o.isLoaded === true,
        name: str(o.name),
        server: str(o.serverName),
        tokens: num(o.tokens),
      }
    }),
    total: num(r.totalTokens),
  }
}

export const contextUsageLine = (requestId: string) =>
  JSON.stringify({
    request: { subtype: 'get_context_usage' },
    request_id: requestId,
    type: 'control_request',
  })
