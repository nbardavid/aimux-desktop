// What Claude Code runs on the side (sub-agents, background shells): its `task_*` events say when
// each starts, how it goes and how it ends, beyond the turn that started it. `stop_task` ends one.

/** One task, by the id of the tool call that started it. */
export interface Task {
  /** Claude Code's id for it: what `stop_task` takes. */
  id: string
  status: 'running' | 'completed' | 'failed' | 'stopped'
  /** The tool it used last, while it runs (sub-agents only). */
  lastTool: string | null
  tokens: number | null
  toolUses: number | null
}

type Json = Record<string, unknown>

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** The tasks after a `system` line; `null` when the line is not a task event. */
export function withTaskEvent(
  tasks: Readonly<Record<string, Task>>,
  m: Json
): Record<string, Task> | null {
  const id = str(m.task_id)
  if (id === '' || !str(m.subtype).startsWith('task_')) return null
  const call = str(m.tool_use_id) || (Object.entries(tasks).find(([, t]) => t.id === id)?.[0] ?? '')
  if (call === '') return null
  const known: Task = tasks[call] ?? {
    id,
    lastTool: null,
    status: 'running',
    tokens: null,
    toolUses: null,
  }
  if (m.subtype === 'task_started') return { ...tasks, [call]: { ...known, id, status: 'running' } }
  if (m.subtype === 'task_progress') {
    const usage = (m.usage ?? {}) as Json
    return {
      ...tasks,
      [call]: {
        ...known,
        lastTool: str(m.last_tool_name) || known.lastTool,
        tokens: num(usage.total_tokens) ?? known.tokens,
        toolUses: num(usage.tool_uses) ?? known.toolUses,
      },
    }
  }
  if (m.subtype === 'task_notification') {
    const said = str(m.status)
    let status: Task['status'] = 'completed'
    if (said === 'failed' || said === 'error') status = 'failed'
    else if (said === 'stopped' || said === 'killed' || said === 'cancelled') status = 'stopped'
    return { ...tasks, [call]: { ...known, status } }
  }
  return null
}

/** The request ids of task stops. */
export const STOP_TASK = 'stop-task-'

/** Asks Claude Code to stop task `taskId` (a sub-agent, a background shell). */
export const stopTaskLine = (requestId: string, taskId: string) =>
  JSON.stringify({
    request: { subtype: 'stop_task', task_id: taskId },
    request_id: requestId,
    type: 'control_request',
  })
