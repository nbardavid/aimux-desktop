import { invoke } from '@tauri-apps/api/core'
import { type ReactNode, useEffect, useMemo, useState } from 'react'

import type { QuotaCache } from '../model/quota'

import {
  compact,
  type CounterDays,
  coveredWeeks,
  dayCost,
  formatSpan,
  formatUsd,
  heatmapWeeks,
  lastDays,
  levels,
  localDay,
  sessionLengths,
  streaks,
  sumBy,
  topEntries,
  type UsageDays,
} from '../stats/model'
import { QuotaWindows } from './quotas'

interface StatsFile {
  history: { tools?: { claude?: UsageDays; codex?: UsageDays }; version?: number } | null
  counters: { days?: CounterDays } | null
  rolling: boolean
}

const PAGES = ['Usage', 'Projects', 'aimux'] as const
type Page = (typeof PAGES)[number]
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const CHART_DAYS = 30

function Tile({ hint, label, value }: { label: string; value: string; hint?: string }) {
  return (
    <div className="tile">
      <span className="tile-label">{label}</span>
      <span className="tile-value">{value}</span>
      {hint !== undefined && <span className="tile-hint">{hint}</span>}
    </div>
  )
}

function Cell({ children, note, title }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="cell">
      <div className="cell-head">
        <span>{title}</span>
        {note !== undefined && <span className="cell-note">{note}</span>}
      </div>
      {children}
    </section>
  )
}

function Bars({
  format = compact,
  labels,
  values,
}: {
  values: number[]
  labels?: string[]
  format?: (n: number) => string
}) {
  const max = Math.max(1, ...values)
  return (
    <div className="vbars">
      {values.map((v, i) => (
        // oxlint-disable-next-line react/no-array-index-key -- bars are positional
        <div key={i} className="vbar" title={`${labels?.[i] ?? ''} ${format(v)}`.trim()}>
          <span style={{ height: `${(v / max) * 100}%` }} />
          {labels && i % Math.ceil(values.length / 8) === 0 && <em>{labels[i]}</em>}
        </div>
      ))}
    </div>
  )
}

function Ranking({
  entries,
  format = compact,
}: {
  entries: [string, number][]
  format?: (n: number) => string
}) {
  const max = Math.max(1, ...entries.map(([, v]) => v))
  if (entries.length === 0) return <div className="quiet">Nothing yet</div>
  return (
    <div className="ranking">
      {entries.map(([label, value]) => (
        <div className="rank" key={label}>
          <span className="rank-label" title={label}>
            {label}
          </span>
          <span className="rank-bar">
            <span style={{ width: `${(value / max) * 100}%` }} />
          </span>
          <span className="rank-value">{format(value)}</span>
        </div>
      ))}
    </div>
  )
}

function Facts({ rows }: { rows: [string, string][] }) {
  const shown = rows.filter(([, v]) => v !== '' && v !== '0')
  if (shown.length === 0) return <div className="quiet">Nothing yet</div>
  return (
    <dl className="facts">
      {shown.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  )
}

const short = (path: string) => path.split('/').filter(Boolean).slice(-2).join('/')
const modelName = (m: string) => m.replace(/^claude-/, '').replace(/-\d{8}$/, '')
const dayLabel = (key: string) => key.slice(5).replace('-', '/')

function UsagePage({
  claude,
  codex,
  quotas,
  today,
}: {
  claude: UsageDays
  codex: UsageDays
  quotas: QuotaCache
  today: Date
}) {
  const keys = Object.keys(claude)
  const days = Object.values(claude)
  const total = sumBy(days, (d) => d.prompts ?? 0)
  const streak = streaks(claude, today)
  const month = localDay(today).slice(0, 7)
  const monthCost = sumBy(
    keys.filter((k) => k.startsWith(month)),
    (k) => dayCost(claude[k] ?? {}).usd
  )
  const weeks = heatmapWeeks(claude, today, coveredWeeks(claude, today))
  const flat = weeks.flat()
  const cellLevels = levels(flat.map((k) => (k === null ? 0 : (claude[k]?.prompts ?? 0))))
  const busiest = Math.max(0, ...days.map((d) => d.prompts ?? 0))
  const hours = Array.from({ length: 24 }, (_, h) => sumBy(days, (d) => d.hours?.[h] ?? 0))
  const peak = hours.indexOf(Math.max(...hours))
  const week = WEEKDAYS.map((_, wd) =>
    sumBy(
      keys.filter((k) => new Date(`${k}T12:00`).getDay() === wd),
      (k) => claude[k]?.prompts ?? 0
    )
  )
  const weekTotal = sumBy(week, (n) => n)
  const chart = lastDays(CHART_DAYS, today)
  const tokens = chart.map((k) => (claude[k]?.tokens?.total ?? 0) + (codex[k]?.tokens?.total ?? 0))
  const recent = lastDays(7, today).filter((k) => claude[k] !== undefined)
  const perDayCost =
    recent.length === 0 ? 0 : sumBy(recent, (k) => dayCost(claude[k] ?? {}).usd) / recent.length
  const allCost = days.map(dayCost)

  return (
    <>
      <div className="tiles">
        <Tile label="Prompts" value={compact(total)} hint="all time" />
        <Tile
          label="Per day"
          value={String(streak.activeDays === 0 ? 0 : Math.round(total / streak.activeDays))}
          hint="on an active day"
        />
        <Tile label="Streak" value={`${streak.current}d`} hint={`best ${streak.best}d`} />
        <Tile label="This month" value={formatUsd(monthCost)} hint="estimated" />
      </div>
      <Cell
        title="Activity"
        note={`${streak.activeDays} active days · busiest ${busiest} · longest gap ${streak.longestGap}d`}
      >
        <div className="heatmap" style={{ gridTemplateColumns: `repeat(${weeks.length}, 1fr)` }}>
          {flat.map((key, i) => (
            <span
              // oxlint-disable-next-line react/no-array-index-key -- cells are positional
              key={i}
              className={key === null ? 'hm hm-blank' : `hm hm-${cellLevels[i]}`}
              title={key === null ? undefined : `${key} · ${claude[key]?.prompts ?? 0} prompts`}
            />
          ))}
        </div>
      </Cell>
      <div className="grid-2">
        <Cell title="Time of day" note={`peak ${String(peak).padStart(2, '0')}:00`}>
          <Bars values={hours} labels={hours.map((_, h) => `${h}h`)} />
        </Cell>
        <Cell
          title="Week"
          note={`weekends ${weekTotal === 0 ? 0 : Math.round((((week[0] ?? 0) + (week[6] ?? 0)) / weekTotal) * 100)}%`}
        >
          <Bars values={week} labels={WEEKDAYS} />
        </Cell>
        <Cell title="Models" note="by tokens">
          <Ranking
            entries={topEntries(days, (d) => d.models, 6).map(([m, n]) => [modelName(m), n])}
          />
        </Cell>
        <Cell title="Tokens" note={`${formatUsd(perDayCost)} a day`}>
          <Bars values={tokens} labels={chart.map(dayLabel)} />
          <div className="cell-foot">
            {compact(sumBy([...days, ...Object.values(codex)], (d) => d.tokens?.total ?? 0))} tokens
            · {formatUsd(sumBy(allCost, (c) => c.usd))} estimated ·{' '}
            {formatUsd(sumBy(allCost, (c) => c.saved))} saved by cache
          </div>
        </Cell>
      </div>
      {Object.keys(quotas).length > 0 && (
        <Cell title="Quotas">
          <QuotaWindows cache={quotas} />
        </Cell>
      )}
    </>
  )
}

function ProjectsPage({ claude, today }: { claude: UsageDays; today: Date }) {
  const days = Object.values(claude)
  const projects = topEntries(days, (d) => d.projects, 8).map(([p, n]): [string, number] => [
    short(p),
    n,
  ])
  const branches = topEntries(days, (d) => d.branches, 6)
  const sessions = sessionLengths(days)
  const chart = lastDays(CHART_DAYS, today)
  const perDay = chart.map((k) => Object.keys(claude[k]?.sessions ?? {}).length)
  const record = (pick: (k: string) => number): [string, number] => {
    let best: [string, number] = ['', 0]
    for (const k of Object.keys(claude)) if (pick(k) > best[1]) best = [k, pick(k)]
    return best
  }
  const [busyDay, busy] = record((k) => claude[k]?.prompts ?? 0)
  const [tokenDay, tokens] = record((k) => claude[k]?.tokens?.total ?? 0)
  const [costDay, cost] = record((k) => dayCost(claude[k] ?? {}).usd)
  const longestPrompt = Math.max(0, ...days.map((d) => d.promptChars?.max ?? 0))
  const lateNights = sumBy(
    days,
    (d) => (d.hours?.[2] ?? 0) + (d.hours?.[3] ?? 0) + (d.hours?.[4] ?? 0)
  )

  return (
    <>
      <div className="tiles">
        <Tile label="Projects" value={String(projects.length)} hint="most prompted" />
        <Tile label="Branches" value={String(branches.length)} hint="most tokens" />
        <Tile label="Sessions" value={compact(sessions.count)} hint="all time" />
        <Tile
          label="Typical session"
          value={sessions.count === 0 ? '—' : formatSpan(sessions.median)}
          hint="median"
        />
      </div>
      <div className="grid-2">
        <Cell title="Projects" note="prompts">
          <Ranking entries={projects} />
        </Cell>
        <Cell title="Session length" note={`longest ${formatSpan(sessions.longest)}`}>
          <Ranking
            entries={sessions.buckets.map((b): [string, number] => [b.label, b.count])}
            format={String}
          />
        </Cell>
        <Cell title="Branches" note="tokens">
          <Ranking entries={branches} />
        </Cell>
        <Cell title="Sessions a day">
          <Bars values={perDay} labels={chart.map(dayLabel)} format={String} />
        </Cell>
      </div>
      <Cell title="Records">
        <Facts
          rows={[
            ['Busiest day', busy > 0 ? `${busy} prompts · ${busyDay}` : ''],
            ['Longest session', sessions.longest > 0 ? formatSpan(sessions.longest) : ''],
            ['Most tokens', tokens > 0 ? `${compact(tokens)} · ${tokenDay}` : ''],
            ['Priciest day', cost > 0 ? `${formatUsd(cost)} · ${costDay}` : ''],
            ['Longest prompt', longestPrompt > 0 ? `${compact(longestPrompt)} chars` : ''],
            ['Late nights', lateNights > 0 ? `${lateNights} prompts between 02:00 and 05:00` : ''],
          ]}
        />
      </Cell>
    </>
  )
}

function distance(keys: number) {
  const mm = keys * 0.8
  if (mm >= 1e6) return `${(mm / 1e6).toFixed(1)} km`
  if (mm >= 1000) return `${(mm / 1000).toFixed(1)} m`
  return `${Math.round(mm / 10)} cm`
}

function AimuxPage({ counters, today }: { counters: CounterDays; today: Date }) {
  const days = Object.values(counters)
  const total = (key: string) => sumBy(days, (d) => d[key] ?? 0)
  const chart = lastDays(CHART_DAYS, today)
  const minutes = chart.map((k) => (counters[k]?.uptimeMs ?? 0) / 60_000)
  const splits = total('splitsHorizontal') + total('splitsVertical')
  if (days.length === 0)
    return <div className="quiet">Nothing counted yet — the TUI counts from its first run.</div>
  return (
    <>
      <div className="tiles">
        <Tile label="In aimux" value={formatSpan(total('uptimeMs'))} hint="all time" />
        <Tile label="Keys" value={compact(total('keys'))} hint="pressed" />
        <Tile label="Distance" value={distance(total('keys'))} hint="of fingers, at 0.8 mm a key" />
        <Tile label="Runs" value={compact(total('runsStarted'))} hint="TUI launches" />
      </div>
      <div className="grid-2">
        <Cell title="Time a day" note="minutes">
          <Bars
            values={minutes}
            labels={chart.map(dayLabel)}
            format={(n) => `${Math.round(n)} min`}
          />
        </Cell>
        <Cell title="Keys a day">
          <Bars values={chart.map((k) => counters[k]?.keys ?? 0)} labels={chart.map(dayLabel)} />
        </Cell>
      </div>
      <Cell title="What you built" note="all time">
        <Facts
          rows={[
            ['Workspaces', String(total('workspacesCreated'))],
            ['Tabs', String(total('tabsOpened'))],
            [
              'Splits',
              splits > 0
                ? `${splits} · ${Math.round((total('splitsVertical') / splits) * 100)}% vertical`
                : '',
            ],
            ['Snippets', String(total('snippetsFired'))],
            ['Lines scrolled', compact(total('scrollLines'))],
            ['Daemon restarts', String(total('daemonRestarts'))],
            ['Longest run', formatSpan(Math.max(0, ...days.map((d) => d.longestRunMs ?? 0)))],
            ['Days counted', String(days.length)],
          ]}
        />
      </Cell>
      <p className="page-note">A count and nothing else — no key identity is recorded.</p>
    </>
  )
}

export function StatsView({ quotas }: { quotas: QuotaCache }) {
  const [file, setFile] = useState<StatsFile | null>(null)
  const [page, setPage] = useState<Page>('Usage')
  const today = useMemo(() => new Date(), [])

  useEffect(() => {
    void invoke<StatsFile>('read_stats').then(setFile)
  }, [])

  const claude = file?.history?.tools?.claude ?? {}
  const codex = file?.history?.tools?.codex ?? {}
  const unreadable = file !== null && file.history !== null && (file.history.version ?? 0) < 1
  return (
    <div className="page">
      <nav className="page-nav" aria-label="Stats pages">
        <div className="page-title">Stats</div>
        {PAGES.map((p) => (
          <button
            type="button"
            key={p}
            className={p === page ? 'nav-item is-active' : 'nav-item'}
            aria-current={p === page}
            onClick={() => setPage(p)}
          >
            {p}
          </button>
        ))}
      </nav>
      <div className="page-body stats">
        {file === null && <div className="quiet">Reading…</div>}
        {unreadable && (
          <div className="field-error">
            usage-history.json did not parse — nothing is being recorded over it.
          </div>
        )}
        {file !== null && file.history === null && (
          <div className="quiet">
            No history yet
            {file.rolling ? ' — the first rollup is running, open Stats again in a minute.' : '.'}
          </div>
        )}
        {file?.history && page === 'Usage' && (
          <UsagePage claude={claude} codex={codex} quotas={quotas} today={today} />
        )}
        {file?.history && page === 'Projects' && <ProjectsPage claude={claude} today={today} />}
        {file && page === 'aimux' && (
          <AimuxPage counters={file.counters?.days ?? {}} today={today} />
        )}
      </div>
    </div>
  )
}
