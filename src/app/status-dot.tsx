import type { Signal } from '../model/catalog'

const LABEL: Record<Signal, string> = {
  done: 'Done',
  waiting: 'Waiting for you',
  working: 'Working',
}

/** A dot alone where space is tight; `withLabel` adds the word. */
export function StatusDot({ signal, withLabel = false }: { signal: Signal; withLabel?: boolean }) {
  const dot = <span className={`st st-${signal}`} title={withLabel ? undefined : LABEL[signal]} />
  if (!withLabel) return dot
  return (
    <span className="status">
      {dot}
      {LABEL[signal]}
    </span>
  )
}
