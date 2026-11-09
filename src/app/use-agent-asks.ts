import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useEffect, useRef } from 'react'

/**
 * What a chat's agent asks of the window through aimux's MCP server (relayed by the host):
 * a new workspace, as the composer makes one, or a prompt for a chat it started.
 */
export type AgentAsk = { askId: number } & (
  | {
      op: 'workspace_create'
      projectId: string
      prompt: string
      base: string | null
      model: string | null
      effort: string | null
      parentChat: string
    }
  | { op: 'chat_send'; chatId: string; text: string }
)

type Handle = (ask: AgentAsk) => Promise<object>

const NOT_READY: Handle = async () => {
  throw new Error('aimux is still starting.')
}

/**
 * Runs each ask with the handler last put in the returned ref (set on every render, after
 * the app's early returns) and sends the host its answer, or its error.
 */
export function useAgentAsks() {
  const latest = useRef<Handle>(NOT_READY)
  useEffect(() => {
    const off = listen<AgentAsk>('host-ask', ({ payload }) => {
      void latest
        .current(payload)
        .catch((error: unknown) => ({
          error: error instanceof Error ? error.message : String(error),
        }))
        .then(async (result) => invoke('host_answer', { askId: payload.askId, result }))
        .catch(() => {})
    })
    return () => void off.then((f) => f())
  }, [])
  return latest
}
