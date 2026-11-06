import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

import { type QuotaCache, tightest, type UsageWindow } from '../model/quota'

function barTone(percent: number) {
  if (percent >= 85) return 'bg-critical'
  if (percent >= 60) return 'bg-warn'
  return 'bg-good'
}

function paceTone(stage: string) {
  if (stage.includes('Behind') || stage.includes('behind')) return 'text-warn-ink'
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
      <div className="text-muted-foreground flex flex-wrap gap-x-2.5 gap-y-0.5 pl-[70px] text-xs">
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

/** Every window of Claude's quota. */
function QuotaWindows({ cache }: { cache: QuotaCache }) {
  const entry = cache.claude
  if (!entry) return null
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex justify-between text-sm font-semibold">
        <span>Claude</span>
        <span className="text-faint text-xs font-normal">
          {ago(entry.fetchedAt)}
          {entry.snapshot.planTier !== null && ` · ${entry.snapshot.planTier}`}
        </span>
      </div>
      {entry.snapshot.windows.map((w) => (
        <WindowRow key={w.kind} window={w} />
      ))}
    </div>
  )
}

/** The window closest to its limit, for the sidebar's foot; a click shows every window. */
export function Quotas({ cache, error }: { cache: QuotaCache; error: string | null }) {
  const tight = tightest(cache)
  if (cache.claude === undefined && error === null) return null
  return (
    <div className="flex min-w-0 flex-[0_1_auto]">
      <Popover>
        <PopoverTrigger className="text-faint hover:text-muted-foreground hover:bg-hover data-popup-open:bg-hover inline-flex h-7 max-w-full items-center gap-1.5 overflow-hidden rounded-md px-2 text-xs whitespace-nowrap transition-[background-color,color,scale] duration-120 active:scale-[0.96]">
          {tight ? (
            <>
              <span
                className={cn('size-1.5 flex-none rounded-full', barTone(tight.percent ?? 0))}
              />
              {tight.label}
              <span className="text-muted-foreground font-medium tabular-nums">
                {Math.round(tight.percent ?? 0)}%
              </span>
            </>
          ) : (
            <span className="text-faint">Quotas unavailable</span>
          )}
        </PopoverTrigger>
        <PopoverContent
          side="top"
          sideOffset={10}
          aria-label="Quotas"
          className="w-[340px] gap-4 px-4 pt-3.5 pb-4"
        >
          <QuotaWindows cache={cache} />
          {error !== null && (
            <div className="text-critical-ink text-xs [overflow-wrap:anywhere]">{error}</div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  )
}
