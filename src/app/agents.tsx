// Sub-agents: a card in the conversation where each one starts, a row of the ones at work
// over the composer, and the bar over a sub-agent's own chat when it is opened.
import { ArrowLeftIcon, ChevronRightIcon, SquareIcon, XIcon } from 'lucide-react'

import { Kbd } from '@/components/ui/kbd'
import { cn } from '@/lib/utils'

import { type AgentRun, type Block, toolSummary } from '../chat/model'
import { BrailleSpinner } from './braille-spinner'
import { useLoaderChoice } from './loader-choice'

const tools = (run: AgentRun) =>
  run.chat.turns.flatMap((t) => t.blocks).filter((b) => b.kind === 'tool')

/** One line on where it is: what it does now, or what it answered. */
function status(run: AgentRun, cwd: string): string {
  const { result, stopped } = run.call
  if (run.task?.status === 'stopped') return 'Stopped'
  if (run.running && run.task?.lastTool != null) return `Using ${run.task.lastTool}`
  if (result) return firstLine(result.text) || (result.isError ? 'Failed' : 'Done')
  if (stopped === true) return 'Stopped'
  const last = tools(run).at(-1) as (Block & { kind: 'tool' }) | undefined
  return last ? `${last.name} ${firstLine(toolSummary(last.name, last.input, cwd))}` : 'Starting'
}

const firstLine = (text: string) => text.trim().split('\n')[0] ?? ''

function Mark({ run }: { run: AgentRun }) {
  const loaders = useLoaderChoice()
  if (run.running) return <BrailleSpinner loader={loaders.working} className="text-faint" />
  let tone = 'bg-good'
  if (run.call.stopped === true || run.task?.status === 'stopped')
    tone = 'border-faint border-[1.5px]'
  else if (run.call.result?.isError === true) tone = 'bg-critical'
  return <span className={cn('size-[7px] rounded-full', tone)} />
}

/** In the conversation, where Claude started it: a click opens its chat. */
export function AgentCard({
  cwd,
  onOpen,
  run,
}: {
  run: AgentRun
  cwd: string
  onOpen: (id: string) => void
}) {
  const count = tools(run).length
  return (
    <button
      type="button"
      className="group/agent hover:border-line-strong hover:bg-hover flex w-full min-w-0 items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors duration-120"
      onClick={() => onOpen(run.call.id)}
    >
      <span className="grid size-4 flex-none place-items-center">
        <Mark run={run} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-base">
          <span className="text-faint">{run.kind} · </span>
          {run.title}
        </span>
        <span className="text-faint truncate font-mono text-xs">{status(run, cwd)}</span>
      </span>
      <span className="text-faint group-hover/agent:text-muted-foreground flex flex-none items-center gap-1 text-xs tabular-nums">
        {count > 0 && `${count} ${count === 1 ? 'tool' : 'tools'}`}
        <ChevronRightIcon className="size-3.5" />
      </span>
    </button>
  )
}

/** Over the composer, while any sub-agent works: one pill each, to open it from anywhere. */
export function RunningAgents({
  onOpen,
  onStop,
  runs,
}: {
  runs: AgentRun[]
  onOpen: (id: string) => void
  /** Stops one, by its task id: shown once Claude Code has said which task it is. */
  onStop?: (taskId: string) => void
}) {
  if (runs.length === 0) return null
  return (
    <div className="animate-in fade-in slide-in-from-bottom-[4px] flex flex-wrap gap-1.5 duration-160 ease-out">
      {runs.map((run) => {
        const task = run.task
        return (
          <span
            key={run.call.id}
            className="group/pill bg-background hover:border-line-strong flex h-6 max-w-[260px] flex-none items-center rounded-full border text-xs transition-colors duration-120"
          >
            <button
              type="button"
              className="hover:bg-hover flex h-full min-w-0 items-center gap-1.5 rounded-full pr-2.5 pl-2 transition-colors duration-120"
              data-tip={task?.lastTool == null ? undefined : `Using ${task.lastTool}`}
              data-tip-side="top"
              onClick={() => onOpen(run.call.id)}
            >
              <Mark run={run} />
              <span className="truncate">{run.title}</span>
              {task?.toolUses != null && task.toolUses > 0 && (
                <span className="text-faint flex-none tabular-nums">{task.toolUses}</span>
              )}
            </button>
            {onStop && task && (
              <button
                type="button"
                aria-label={`Stop ${run.title}`}
                data-tip="Stop it"
                data-tip-side="top"
                className="text-faint hover:text-foreground hover:bg-hover -ml-1.5 mr-0.5 grid size-5 flex-none place-items-center rounded-full transition-colors duration-120"
                onClick={() => onStop(task.id)}
              >
                <XIcon className="size-3" />
              </button>
            )}
          </span>
        )
      })}
    </div>
  )
}

/** Over a sub-agent's chat: the way back to the conversation. */
export function AgentBar({
  onBack,
  onStop,
  place,
  run,
}: {
  run: AgentRun
  place: string
  onBack: () => void
  onStop?: (taskId: string) => void
}) {
  const task = run.task
  return (
    <div className="bg-chrome flex h-9 flex-none items-center gap-2 border-b px-3 text-sm">
      <button
        type="button"
        aria-label="Back to the chat"
        className="hover:bg-hover text-muted-foreground hover:text-foreground grid size-6 place-items-center rounded-md transition-colors duration-120"
        onClick={onBack}
      >
        <ArrowLeftIcon className="size-3.5" />
      </button>
      <button type="button" className="text-faint hover:text-foreground truncate" onClick={onBack}>
        {place}
      </button>
      <span className="text-label">/</span>
      <span className="truncate">
        <span className="text-faint">{run.kind} · </span>
        {run.title}
      </span>
      <span className="text-label ml-auto flex flex-none items-center gap-3 text-xs">
        {run.running && onStop && task && (
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground hover:bg-hover inline-flex h-6 items-center gap-1.5 rounded-md border px-2 transition-colors duration-120"
            onClick={() => onStop(task.id)}
          >
            <SquareIcon className="size-2.5 fill-current" />
            Stop
          </button>
        )}
        <span>
          <Kbd className="text-label">esc</Kbd> to go back
        </span>
      </span>
    </div>
  )
}
