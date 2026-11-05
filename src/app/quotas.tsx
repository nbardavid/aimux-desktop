import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

import type { QuotaCache, UsageWindow } from '../model/quota'

const TOOL_LABEL = { claude: 'Claude', codex: 'Codex' } as const
const TOOL_SHORT = { claude: 'Cl', codex: 'Cx' } as const

function barTone(percent: number) {
  if (percent >= 85) return 'bg-critical'
  if (percent >= 60) return 'bg-warn'
  return 'bg-good'
}

function paceTone(stage: string) {
  if (stage.includes('Behind') || stage.includes('behind')) return 'text-[#946f0e]'
  if (stage === 'onTrack') return 'text-faint'
  return 'text-good'
}

function ago(ms: number) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  return `${Math.round(s / 3600)}h ago`
}

function WindowRow({ window }: { window: UsageWindow }) {
  const percent = window.percent ?? 0
  return (
    <div className="flex flex-col gap-[3px]">
      <div className="flex items-center gap-2.5">
        <span className="w-[60px] flex-none font-medium">{window.label}</span>
        <span className="bg-hover h-[5px] flex-1 overflow-hidden rounded-full">
          <span
            className={cn('block h-full rounded-full', barTone(percent))}
            style={{ width: `${percent}%` }}
          />
        </span>
        <span className="w-9 text-right font-medium tabular-nums">
          {window.percent === null ? '—' : `${Math.round(percent)}%`}
        </span>
      </div>
      <div className="text-muted-foreground flex flex-wrap gap-x-2.5 gap-y-0.5 pl-[70px] text-[11.5px]">
        {window.timeRemaining !== null && <span>resets in {window.timeRemaining}</span>}
        {window.pace && (
          <span className={paceTone(window.pace.stage)}>
            {window.pace.label}
            {window.pace.rightText !== null && ` · ${window.pace.rightText}`}
          </span>
        )}
      </div>
    </div>
  )
}

/** Every window of every tool in the cache. */
export function QuotaWindows({ cache }: { cache: QuotaCache }) {
  return (
    <>
      {(['claude', 'codex'] as const).map((tool) => {
        const entry = cache[tool]
        if (!entry) return null
        return (
          <div key={tool} className="flex flex-col gap-2.5">
            <div className="flex justify-between text-[13px] font-semibold">
              <span>{TOOL_LABEL[tool]}</span>
              <span className="text-faint text-[11.5px] font-normal">
                {ago(entry.fetchedAt)}
                {entry.snapshot.planTier !== null && ` · ${entry.snapshot.planTier}`}
              </span>
            </div>
            {entry.snapshot.windows.map((w) => (
              <WindowRow key={w.kind} window={w} />
            ))}
          </div>
        )
      })}
    </>
  )
}

/** One figure per tool for the sidebar's foot; a click shows every window. */
export function Quotas({ cache, error }: { cache: QuotaCache; error: string | null }) {
  const tools = (['claude', 'codex'] as const).filter((tool) => cache[tool] !== undefined)
  if (tools.length === 0 && error === null) return null
  return (
    <div className="flex min-w-0 flex-[0_1_auto]">
      <Popover>
        <PopoverTrigger className="border-line-strong text-muted-foreground hover:bg-hover data-popup-open:bg-hover inline-flex h-6 max-w-full items-center gap-2 overflow-hidden rounded-md border border-dashed px-2 text-[11.5px] whitespace-nowrap transition-[background-color,border-color,color,scale] duration-120 hover:border-solid active:scale-[0.96] data-popup-open:border-solid">
          {tools.map((tool) => {
            const percent = cache[tool]?.snapshot.percent ?? null
            return (
              <span key={tool} className="inline-flex items-center gap-[5px]">
                <span className={cn('size-1.5 flex-none rounded-full', barTone(percent ?? 0))} />
                {TOOL_SHORT[tool]}
                <span className="text-foreground font-medium tabular-nums">
                  {percent === null ? '—' : `${Math.round(percent)}%`}
                </span>
              </span>
            )
          })}
          {tools.length === 0 && <span className="text-faint">Quotas unavailable</span>}
        </PopoverTrigger>
        <PopoverContent
          side="top"
          sideOffset={10}
          aria-label="Quotas"
          className="border-border w-[340px] gap-4 rounded-xl border px-4 pt-3.5 pb-4 shadow-[0_16px_40px_-16px_rgb(43_40_38/0.22)]"
        >
          <QuotaWindows cache={cache} />
          {error !== null && (
            <div className="text-critical text-[12.5px] [overflow-wrap:anywhere]">{error}</div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  )
}
