// The TUI's quota snapshot (src/services/ai-usage), rebuilt from the raw endpoint so the GUI can
// write the shared cache in the same shape when it is the one polling.

export interface UsagePace {
  delta: number
  stage:
    | 'farAhead'
    | 'ahead'
    | 'slightlyAhead'
    | 'onTrack'
    | 'slightlyBehind'
    | 'behind'
    | 'farBehind'
  label: string
  rightText: string | null
}

export interface UsageWindow {
  kind: string
  label: string
  percent: number | null
  resetAt: string | null
  timeRemaining: string | null
  windowSeconds: number | null
  pace: UsagePace | null
}

export interface UsageSnapshot {
  tool: 'claude' | 'codex'
  percent: number | null
  tokens: { input: number; output: number; cache: number; total: number }
  costUSD: number | null
  resetAt: string | null
  timeRemaining: string | null
  burnRatePerHour: number | null
  lastUpdated: string
  planTier: string | null
  windows: UsageWindow[]
  error?: string
  stale?: boolean
}

export type QuotaCache = Partial<
  Record<'claude' | 'codex', { fetchedAt: number; snapshot: UsageSnapshot }>
>

interface RawWindow {
  utilization?: number | null
  resets_at?: string | null
}

export interface RawClaudeUsage {
  five_hour?: RawWindow | null
  seven_day?: RawWindow | null
  seven_day_opus?: RawWindow | null
  seven_day_sonnet?: RawWindow | null
  limits?: {
    kind?: string
    percent?: number | null
    resets_at?: string | null
    scope?: { model?: { display_name?: string } }
  }[]
}

const SESSION_S = 5 * 3600
const WEEK_S = 7 * 86_400

/** `2d 3h`, `4h 12m`, `5h`, `40m`; `null` once the reset has passed. */
export function formatRemaining(seconds: number): string | null {
  if (seconds <= 0) return null
  const d = Math.floor(seconds / 86_400)
  const h = Math.floor((seconds % 86_400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`
  return `${m}m`
}

function stageOf(delta: number): UsagePace['stage'] {
  const size = Math.abs(Math.round(delta))
  if (size <= 2) return 'onTrack'
  const behind = delta > 0
  if (size <= 6) return behind ? 'slightlyBehind' : 'slightlyAhead'
  if (size <= 12) return behind ? 'behind' : 'ahead'
  return behind ? 'farBehind' : 'farAhead'
}

/** How far use runs ahead of an even spend over the window; positive = burning too fast. */
export function paceOf(
  percent: number,
  untilReset: number,
  windowSeconds: number
): UsagePace | null {
  if (untilReset <= 0 || untilReset > windowSeconds) return null
  const elapsed = windowSeconds - untilReset
  const delta = percent - (elapsed / windowSeconds) * 100
  const rounded = Math.round(delta)
  let stage = stageOf(delta)
  let label = 'On pace'
  if (stage !== 'onTrack') label = rounded > 0 ? `Behind (+${rounded}%)` : `Ahead (${rounded}%)`
  let rightText: string | null = null
  if (elapsed > 0) {
    const toFull = percent > 0 ? ((100 - percent) * elapsed) / percent : Infinity
    rightText =
      toFull >= untilReset ? 'Lasts to reset' : `Runs out in ${formatRemaining(toFull) ?? '0m'}`
    // Running out before the reset is never "on pace", however small the lead.
    if (toFull < untilReset && stage === 'onTrack') {
      stage = 'slightlyBehind'
      label = 'Too fast'
    }
  }
  return { delta, label, rightText, stage }
}

function windowOf(
  kind: string,
  label: string,
  raw: { percent: number | null | undefined; resetAt: string | null | undefined },
  windowSeconds: number,
  withPace: boolean,
  now: number
): UsageWindow | null {
  const percent = typeof raw.percent === 'number' ? Math.min(100, Math.max(0, raw.percent)) : null
  const resetAt = raw.resetAt ?? null
  if (percent === null && resetAt === null) return null
  const untilReset = resetAt === null ? 0 : (Date.parse(resetAt) - now) / 1000
  return {
    kind,
    label,
    pace: withPace && percent !== null ? paceOf(percent, untilReset, windowSeconds) : null,
    percent,
    resetAt,
    timeRemaining: formatRemaining(untilReset),
    windowSeconds,
  }
}

export function claudeSnapshot(raw: RawClaudeUsage, now = Date.now()): UsageSnapshot {
  const from = (w: RawWindow | null | undefined) => ({
    percent: w?.utilization,
    resetAt: w?.resets_at,
  })
  const windows = [
    windowOf('session', 'Session', from(raw.five_hour), SESSION_S, false, now),
    windowOf('weekly', 'Weekly', from(raw.seven_day), WEEK_S, true, now),
    windowOf('opus', 'Opus', from(raw.seven_day_opus), WEEK_S, false, now),
    windowOf('sonnet', 'Sonnet', from(raw.seven_day_sonnet), WEEK_S, false, now),
  ].filter((w): w is UsageWindow => w !== null)
  for (const limit of raw.limits ?? []) {
    const name = limit.scope?.model?.display_name
    if (limit.kind !== 'weekly_scoped' || name === undefined) continue
    const kind = name.toLowerCase()
    if (windows.some((w) => w.kind === kind)) continue
    const w = windowOf(
      kind,
      name,
      { percent: limit.percent, resetAt: limit.resets_at },
      WEEK_S,
      false,
      now
    )
    if (w) windows.push(w)
  }
  const main = windows.find((w) => w.kind === 'session') ?? windows.find((w) => w.kind === 'weekly')
  return {
    burnRatePerHour: null,
    costUSD: null,
    lastUpdated: new Date(now).toISOString(),
    percent: main?.percent ?? null,
    planTier: null,
    resetAt: main?.resetAt ?? null,
    timeRemaining: main?.timeRemaining ?? null,
    tokens: { cache: 0, input: 0, output: 0, total: 0 },
    tool: 'claude',
    windows,
  }
}

/** The window closest to its limit, across every tool: what the sidebar's chip shows. */
export function tightest(cache: QuotaCache): UsageWindow | null {
  let best: UsageWindow | null = null
  for (const entry of Object.values(cache)) {
    for (const w of entry?.snapshot.windows ?? []) {
      if (w.percent !== null && (best === null || w.percent > (best.percent ?? 0))) best = w
    }
  }
  return best
}
