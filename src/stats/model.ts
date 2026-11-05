// Stats from ~/.config/aimux/usage-history.json and usage-counters.json, computed as the TUI's
// stats screen does (src/ui/components/stats/*). Day keys are local 'YYYY-MM-DD'.

export interface UsageTokens {
  cacheRead: number
  cacheWrite: number
  input: number
  output: number
  total: number
}

export interface UsageDay {
  branches?: Record<string, number>
  hours?: number[]
  models?: Record<string, number>
  promptChars?: { count: number; max: number; sum: number }
  projects?: Record<string, number>
  prompts?: number
  sessions?: Record<string, { first: number; last: number; prompts: number }>
  tokens?: UsageTokens
  turnMs?: { count: number; max: number; sum: number }
}

export type UsageDays = Record<string, UsageDay>
export type CounterDays = Record<string, Partial<Record<string, number>>>

export const localDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const dayDate = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1)
}

const DAY_MS = 86_400_000
const daysBetween = (a: string, b: string) =>
  Math.round((dayDate(b).getTime() - dayDate(a).getTime()) / DAY_MS)

/** The last `n` day keys, oldest first, ending today. */
export function lastDays(n: number, today: Date): string[] {
  return Array.from({ length: n }, (_, i) =>
    localDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() - (n - 1 - i)))
  )
}

export function streaks(days: UsageDays, today: Date) {
  const active = Object.keys(days)
    .filter((k) => (days[k]?.prompts ?? 0) > 0)
    .toSorted()
  let best = 0
  let run = 0
  let longestGap = 0
  for (let i = 0; i < active.length; i++) {
    const gap = i === 0 ? 1 : daysBetween(active[i - 1] ?? '', active[i] ?? '')
    run = gap === 1 ? run + 1 : 1
    if (gap > 1) longestGap = Math.max(longestGap, gap - 1)
    best = Math.max(best, run)
  }
  const last = active.at(-1)
  const sinceLast = last === undefined ? Infinity : daysBetween(last, localDay(today))
  return { activeDays: active.length, best, current: sinceLast <= 1 ? run : 0, longestGap }
}

/** Quartile levels over the non-zero values, 0 for an empty day, 4 for the busiest quarter. */
export function levels(values: number[]): number[] {
  const sorted = values.filter((v) => v > 0).toSorted((a, b) => a - b)
  const cut = (q: number) => sorted[Math.floor(sorted.length * q)] ?? 0
  const cuts = [cut(0.25), cut(0.5), cut(0.75)]
  return values.map((v) => {
    if (v <= 0) return 0
    const above = cuts.filter((c) => v > c).length
    return above + 1
  })
}

/** Weeks of the heatmap, Sunday first; `null` for days after today. */
export function heatmapWeeks(days: UsageDays, today: Date, weeks: number): (string | null)[][] {
  const end = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() + (6 - today.getDay())
  )
  const todayKey = localDay(today)
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = new Date(
        end.getFullYear(),
        end.getMonth(),
        end.getDate() - (weeks - 1 - w) * 7 - (6 - d)
      )
      const key = localDay(date)
      return key > todayKey ? null : key
    })
  )
}

/** Weeks the history covers, as the TUI sizes its heatmap: at least 4, at most `max`. */
export function coveredWeeks(days: UsageDays, today: Date, max = 53): number {
  const first = Object.keys(days).toSorted()[0]
  if (first === undefined) return 4
  const span = Math.ceil((daysBetween(first, localDay(today)) + 1) / 7) + 1
  return Math.min(max, Math.max(4, span))
}

// USD per million tokens, input / output; the longest matching prefix wins.
const RATES: [string, number, number][] = [
  ['fable-5', 10, 50],
  ['mythos-5', 10, 50],
  ['opus-5', 5, 25],
  ['opus-4-8', 5, 25],
  ['opus-4-7', 5, 25],
  ['opus-4-6', 5, 25],
  ['sonnet-5', 3, 15],
  ['sonnet-4-6', 3, 15],
  ['haiku-4-5', 1, 5],
]

function rateOf(model: string): [number, number] | null {
  const name = model.replace(/^claude-/, '')
  let best: [string, number, number] | null = null
  for (const rate of RATES) {
    if (name.startsWith(rate[0]) && (best === null || rate[0].length > best[0].length)) best = rate
  }
  return best === null ? null : [best[1], best[2]]
}

/** A day's estimated cost: its token split applied to each model in proportion to its share. */
export function dayCost(day: UsageDay): { usd: number; saved: number; unpriced: number } {
  const tokens = day.tokens
  if (!tokens || tokens.total === 0) return { saved: 0, unpriced: 0, usd: 0 }
  let usd = 0
  let saved = 0
  let claimed = 0
  let unpriced = 0
  for (const [model, n] of Object.entries(day.models ?? {})) {
    claimed += n
    const rate = rateOf(model)
    if (rate === null) {
      unpriced += n
      continue
    }
    const share = n / tokens.total
    const [input, output] = rate
    usd +=
      (share *
        (tokens.input * input +
          tokens.output * output +
          tokens.cacheRead * input * 0.1 +
          tokens.cacheWrite * input * 1.25)) /
      1e6
    saved += (share * tokens.cacheRead * input * 0.9) / 1e6
  }
  return { saved, unpriced: unpriced + Math.max(0, tokens.total - claimed), usd }
}

/** `$1 234` from 1000, `$12` from 10, `$1.23` below. */
export function formatUsd(usd: number): string {
  if (usd >= 1000) return `$${Math.round(usd).toLocaleString('en-US').replaceAll(',', ' ')}`
  if (usd >= 10) return `$${Math.round(usd)}`
  return `$${usd.toFixed(2)}`
}

export function compact(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`
  return String(Math.round(n))
}

/** `2d 4h` past 48 hours, `9h 04`, `22 min`, `41 s`. */
export function formatSpan(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s >= 48 * 3600) return `${Math.floor(s / 86_400)}d ${Math.floor((s % 86_400) / 3600)}h`
  if (s >= 3600)
    return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`
  if (s >= 60) return `${Math.floor(s / 60)} min`
  return `${s} s`
}

export function sumBy<T>(items: T[], value: (item: T) => number): number {
  let total = 0
  for (const item of items) total += value(item)
  return total
}

/** Values summed by key across days, biggest first. */
export function topEntries(
  days: UsageDay[],
  pick: (day: UsageDay) => Record<string, number> | undefined,
  n: number
) {
  const totals = new Map<string, number>()
  for (const day of days) {
    for (const [key, value] of Object.entries(pick(day) ?? {}))
      totals.set(key, (totals.get(key) ?? 0) + value)
  }
  return [...totals].toSorted((a, b) => b[1] - a[1]).slice(0, n)
}

const SESSION_BUCKETS: [string, number][] = [
  ['under 5 min', 5],
  ['5 to 15 min', 15],
  ['15 to 30 min', 30],
  ['30 to 60 min', 60],
  ['1 to 2 hours', 120],
  ['over 2 hours', Infinity],
]

export function sessionLengths(days: UsageDay[]) {
  const durations = days
    .flatMap((d) => Object.values(d.sessions ?? {}).map((s) => s.last - s.first))
    .toSorted((a, b) => a - b)
  const buckets = SESSION_BUCKETS.map(([label]) => ({ count: 0, label }))
  for (const ms of durations) {
    const i = SESSION_BUCKETS.findIndex(([, max]) => ms / 60_000 < max)
    const bucket = buckets[i]
    if (bucket) bucket.count++
  }
  return {
    buckets,
    count: durations.length,
    longest: durations.at(-1) ?? 0,
    median: durations[Math.floor(durations.length / 2)] ?? 0,
  }
}
