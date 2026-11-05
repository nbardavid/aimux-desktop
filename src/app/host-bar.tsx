import { useState } from 'react'

const count = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

/**
 * An app update met a background host from an older protocol that still holds work. Nothing
 * starts until the user lets it go: a second Claude on the same session would corrupt it.
 */
export function HostBar({
  lose,
  onRestart,
}: {
  lose: { chats: number; terms: number }
  onRestart: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const clauses = [
    lose.chats > 0 && `${count(lose.chats, 'chat')} working`,
    lose.terms > 0 && `${count(lose.terms, 'terminal')} will close`,
  ].filter(Boolean)
  return (
    <div className="host-bar" role="alert">
      <span className="grow">
        {error ?? `The background process needs a restart: ${clauses.join(', ')}.`}
      </span>
      <button
        type="button"
        className="btn btn-ink"
        disabled={busy}
        onClick={() => {
          setBusy(true)
          void onRestart().catch((error_: unknown) => {
            setBusy(false)
            setError(String(error_))
          })
        }}
      >
        {busy ? 'Restarting…' : 'Restart'}
      </button>
    </div>
  )
}
