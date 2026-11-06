import { XIcon } from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { cn } from '@/lib/utils'

import { dotClass } from './status-dot'

/** "Error: Could not…" reads as "Could not…": the title already says it failed. */
export const errorText = (error: unknown) => String(error).replace(/^(?:Error:\s*)+/i, '')

interface Props {
  role: 'alert' | 'status'
  /** Where it floats, when not at the bottom of its pane. */
  className?: string
  /** Gone for good, once its fade-out ended. */
  onClose: () => void
  /** Dismisses itself after this long, counted again whenever the pointer leaves it. */
  timeout?: number
  /** Given `close`, so a button inside fades the toast out like × does. */
  children: (close: () => void) => ReactNode
}

/**
 * A toast at the bottom right of the pane it sits in (its parent is `relative`), 16px from
 * its edges, out of the reading column: rises in (200ms),
 * fades out (DESIGN.md: 120ms ease-in), × to close, held while the pointer is over it.
 */
export function Toast({ children, className, onClose, role, timeout }: Props) {
  const [leaving, setLeaving] = useState(false)
  const [held, setHeld] = useState(false)
  const close = useCallback(() => setLeaving(true), [])
  useEffect(() => {
    if (timeout === undefined || held || leaving) return
    const timer = setTimeout(close, timeout)
    return () => clearTimeout(timer)
  }, [close, held, leaving, timeout])
  return (
    <div
      className={cn(
        'border-border bg-background absolute right-4 bottom-4 z-4 flex w-[360px] max-w-[calc(100%-32px)] animate-[rise_0.2s_cubic-bezier(0.2,0,0,1)] gap-2.5 rounded-xl border py-3 pr-2 pl-3.5 shadow-[0_16px_40px_-16px_rgb(43_40_38/0.22)]',
        leaving && 'animate-out fade-out fill-mode-forwards duration-120 ease-in',
        className
      )}
      role={role}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onAnimationEnd={(e) => leaving && e.target === e.currentTarget && onClose()}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">{children(close)}</div>
      <Button
        variant="ghost"
        size="icon-sm"
        className="-mt-1 flex-none"
        aria-label="Dismiss"
        onClick={close}
      >
        <XIcon />
      </Button>
    </div>
  )
}

/** A chat asking for you while you look elsewhere. */
export interface Attention {
  chatId: string
  projectId: string
  workspaceId: string
  title: string
  /** What it asks: "Wants to run Bash", and the command. */
  asks: { tool: string; what: string } | null
  where: string
}

/** Something that failed: what was being done, and why it failed. */
export interface Notice {
  title: string
  text: string
}

const TITLE = 'flex min-w-0 items-center gap-2 font-semibold'
const TEXT = 'text-muted-foreground text-xs [overflow-wrap:anywhere]'
const BUTTON = 'h-7 px-2.5 text-xs'

/**
 * "Write the release notes" wants to run Bash: Open chat (⌘↩, wired in app.tsx) or Later.
 * Without `keyed` (the chat on screen has its own question, which ⌘↩ answers) no key opens it.
 */
export function AttentionToast({
  attention,
  className,
  keyed,
  onClose,
  onOpen,
}: {
  attention: Attention
  className?: string
  keyed: boolean
  onOpen: () => void
  onClose: () => void
}) {
  return (
    <Toast role="status" className={className} onClose={onClose}>
      {(close) => (
        <>
          <span className={TITLE}>
            <span className={dotClass('waiting')} />
            <span className="truncate">{attention.title}</span>
          </span>
          {attention.asks?.tool === 'AskUserQuestion' && (
            <span className={cn(TEXT, 'text-foreground')}>Asks: {attention.asks.what}</span>
          )}
          {attention.asks && attention.asks.tool !== 'AskUserQuestion' && (
            <span className={cn(TEXT, 'text-foreground')}>
              Wants to run {attention.asks.tool}
              {attention.asks.what !== '' && (
                <>
                  :{' '}
                  <code className="bg-hover rounded-sm px-1 font-mono text-xs">
                    {attention.asks.what}
                  </code>
                </>
              )}
            </span>
          )}
          <span className={TEXT}>{attention.where}</span>
          <div className="mt-2 flex gap-1.5">
            <Button
              className={cn(BUTTON, keyed && 'pr-1.5')}
              onClick={() => {
                onOpen()
                close()
              }}
            >
              Open chat
              {keyed && <Kbd className="text-white/60">⌘↩</Kbd>}
            </Button>
            <Button variant="outline" className={BUTTON} onClick={close}>
              Later
            </Button>
          </div>
        </>
      )}
    </Toast>
  )
}

/** A failure: what was being done, and why; gone after 6s unless the pointer holds it. */
export function NoticeToast({
  className,
  notice,
  onClose,
}: {
  notice: Notice
  className?: string
  onClose: () => void
}) {
  return (
    <Toast role="alert" className={className} timeout={6000} onClose={onClose}>
      {() => (
        <>
          <span className={TITLE}>{notice.title}</span>
          <span className={TEXT}>{notice.text}</span>
        </>
      )}
    </Toast>
  )
}
