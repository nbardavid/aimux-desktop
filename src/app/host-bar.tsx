import { useState } from 'react'

import { Button } from '@/components/ui/button'

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
    lose.chats > 0 && `${count(lose.chats, 'working chat')} will pause and resume`,
    lose.terms > 0 && `${count(lose.terms, 'terminal')} will close`,
  ].filter(Boolean)
  const said =
    clauses.length === 0
      ? 'Restart the background process to keep working.'
      : `Restart the background process to keep working. ${clauses.join('; ')}.`
  return (
    <div
      className="border-border flex flex-none items-center gap-3 border-b bg-[color-mix(in_srgb,var(--warn)_12%,var(--background))] px-4 py-1.5 text-xs text-warn-ink"
      role="alert"
    >
      <span className="min-w-0 flex-1">{error ?? said}</span>
      <Button
        className="h-7 px-2.5 text-xs"
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
      </Button>
    </div>
  )
}
