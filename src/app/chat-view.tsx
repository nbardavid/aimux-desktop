import { openUrl } from '@tauri-apps/plugin-opener'
import { ArrowUpIcon, MessageCircleIcon, SquareIcon } from 'lucide-react'
import { type KeyboardEvent, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

import { isAppCommand, parseCommand, rankCommands } from '../chat/commands'
import {
  type Block,
  type ChatState,
  type Permission,
  type SlashCommand,
  toolSummary,
} from '../chat/model'
import { CommandHint, CommandMenu } from './command-menu'

interface Props {
  cwd: string
  state: ChatState
  /** What the `/` menu offers: the app's commands and this chat's Claude's. */
  commands: SlashCommand[]
  onSend: (text: string) => void
  /** One of the app's own commands (`/resume`, `/clear`…), typed or picked. */
  onCommand: (name: string, args: string) => void
  onAnswer: (permission: Permission, choice: 'allow' | 'always' | 'deny') => void
  onInterrupt: () => void
}

// Links open in the browser, never in this window; images are not fetched.
const MD: Components = {
  a: ({ children, href }) => (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault()
        if (href !== undefined && /^https?:/.test(href)) void openUrl(href)
      }}
    >
      {children}
    </a>
  ),
  img: ({ alt }) => <span className="text-faint">[{alt ?? 'image'}]</span>,
}

// How a message or a block comes in: a short rise. (Written out whole: Tailwind only sees
// complete class names.)
const ENTER =
  'animate-in fade-in slide-in-from-bottom-[6px] duration-280 ease-[cubic-bezier(0.2,0,0,1)]'
// The same, for a <details>' body as it opens (`[open] > *`).
const OPENING =
  '[[open]>&]:animate-in [[open]>&]:fade-in [[open]>&]:slide-in-from-bottom-[6px] [[open]>&]:duration-200 [[open]>&]:ease-[cubic-bezier(0.2,0,0,1)]'
// A blinking tan block after the last thing a streaming answer wrote.
const CARET =
  '[&>:last-child]:after:ml-0.5 [&>:last-child]:after:inline-block [&>:last-child]:after:h-[1.05em] [&>:last-child]:after:w-[7px] [&>:last-child]:after:animate-[caret_1s_ease-in-out_infinite] [&>:last-child]:after:rounded-[2px] [&>:last-child]:after:bg-tan [&>:last-child]:after:align-[-0.15em]'
// Status dots, as `.st-*` draws them.
const SPINNER =
  'size-[9px] flex-none animate-[spin_0.9s_linear_infinite] rounded-full border-[1.5px] border-faint border-t-transparent'
const DOT = 'size-[7px] flex-none rounded-full'
// A <details> header: a grey row under the pointer, no marker.
const SUMMARY =
  'flex h-7 cursor-pointer list-none items-center gap-2 rounded-lg px-2 text-faint hover:bg-hover hover:text-foreground [&::-webkit-details-marker]:hidden'

const PLUGINS = [remarkGfm]

// A command's output past this many lines folds, with "Show all".
const OUTPUT_LINES = 12

function OutputCard({ text }: { text: string }) {
  const long = text.split('\n').length > OUTPUT_LINES
  const [open, setOpen] = useState(false)
  return (
    <div className="relative rounded-xl border bg-chrome px-3.5 py-2.5 text-ink-soft">
      <div
        className={cn(
          'md text-[13px] leading-[1.55]',
          long &&
            !open &&
            'max-h-[calc(12*1.55em)] overflow-hidden [mask-image:linear-gradient(to_bottom,#000_70%,transparent)]'
        )}
      >
        <Markdown remarkPlugins={PLUGINS} components={MD}>
          {text}
        </Markdown>
      </div>
      {long && (
        <button
          type="button"
          className="mt-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? 'Show less' : 'Show all'}
        </button>
      )}
    </div>
  )
}

const TOOL_OUT = `my-1 ml-2 max-h-[320px] overflow-auto rounded-[8px] border bg-chrome px-3 py-2.5 font-mono text-[12px] leading-[1.55] whitespace-pre-wrap wrap-anywhere ${OPENING}`

function ToolBody({ block }: { block: Block & { kind: 'tool' } }) {
  const { input, name, result } = block
  if (
    name === 'Edit' &&
    typeof input.old_string === 'string' &&
    typeof input.new_string === 'string'
  ) {
    return (
      <pre className={TOOL_OUT}>
        {input.old_string.split('\n').map((line, i) => (
          // oxlint-disable-next-line react/no-array-index-key -- lines are positional
          <div key={`d${i}`} className="bg-critical/8">
            − {line}
          </div>
        ))}
        {input.new_string.split('\n').map((line, i) => (
          // oxlint-disable-next-line react/no-array-index-key -- lines are positional
          <div key={`a${i}`} className="bg-good/9">
            + {line}
          </div>
        ))}
      </pre>
    )
  }
  const command = typeof input.command === 'string' ? input.command : ''
  const shown = name === 'Bash' ? `$ ${command}` : JSON.stringify(input, null, 2)
  return (
    <pre className={TOOL_OUT}>
      {shown}
      {result !== undefined && result.text !== '' && `\n\n${result.text}`}
    </pre>
  )
}

function BlockView({ block, cwd, live }: { block: Block; cwd: string; live: boolean }) {
  if (block.kind === 'text') {
    return (
      <div className={cn('md', live && CARET)}>
        <Markdown remarkPlugins={PLUGINS} components={MD}>
          {block.text}
        </Markdown>
      </div>
    )
  }
  if (block.kind === 'output') return <OutputCard text={block.text} />
  if (block.kind === 'command') return null
  if (block.kind === 'thinking') {
    if (block.text.trim() === '') return null
    return (
      <details className="-ml-2">
        <summary className={cn(SUMMARY, 'w-max italic')}>Thought</summary>
        <div
          className={cn(
            'ml-2 border-l-2 pt-1 pr-2 pb-1.5 pl-4 text-[13px] leading-[1.55] whitespace-pre-wrap text-muted-foreground',
            OPENING
          )}
        >
          {block.text}
        </div>
      </details>
    )
  }
  let dot = SPINNER
  if (block.result) {
    dot = block.result.isError
      ? cn(DOT, 'bg-critical')
      : cn(DOT, 'animate-[pop_0.3s_cubic-bezier(0.2,0,0,1)] bg-good')
  }
  return (
    <details className="-ml-2">
      <summary className={SUMMARY}>
        <span className={dot} />
        <span className="flex-none font-medium text-foreground">{block.name}</span>
        <span className="truncate font-mono text-[12px]">
          {toolSummary(block.name, block.input, cwd)}
        </span>
      </summary>
      <ToolBody block={block} />
    </details>
  )
}

function PermissionCard({
  cwd,
  onAnswer,
  permission,
}: {
  cwd: string
  permission: Permission
  onAnswer: Props['onAnswer']
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-2xl border border-line-strong bg-background px-3.5 py-3 shadow-[0_8px_24px_-14px_rgb(43_40_38/0.25)]',
        ENTER
      )}
      role="alertdialog"
      aria-label={`Allow ${permission.toolName}?`}
    >
      <div className="text-[13.5px]">
        Allow <b>{permission.toolName}</b>?
      </div>
      <code className="max-h-[120px] overflow-auto font-mono text-[12px] whitespace-pre-wrap wrap-anywhere text-muted-foreground">
        {toolSummary(permission.toolName, permission.input, cwd) || permission.description}
      </code>
      <div className="flex justify-end gap-1.5">
        <Button
          variant="secondary"
          size="sm"
          className="px-3"
          onClick={() => onAnswer(permission, 'deny')}
        >
          Deny
        </Button>
        {permission.suggestions.length > 0 && (
          <Button
            variant="secondary"
            size="sm"
            className="px-3"
            onClick={() => onAnswer(permission, 'always')}
          >
            Always allow
          </Button>
        )}
        {/* oxlint-disable-next-line jsx-a11y/no-autofocus -- the decision is the only thing to do */}
        <Button size="sm" className="px-3" autoFocus onClick={() => onAnswer(permission, 'allow')}>
          Allow
        </Button>
      </div>
    </div>
  )
}

const USER = `max-w-[80%] self-end rounded-2xl bg-[#f4f1ec] px-3.5 py-[9px] text-[14px] leading-[1.5] whitespace-pre-wrap wrap-anywhere ${ENTER}`

function UserTurn({ blocks }: { blocks: Block[] }) {
  const first = blocks[0]
  if (first?.kind === 'command') {
    return (
      <div className={cn(USER, 'px-3 py-1.5 font-mono text-[12.5px] leading-[1.5] text-ink-soft')}>
        <span className="font-semibold text-foreground">/{first.name}</span>
        {first.args !== '' && ` ${first.args}`}
      </div>
    )
  }
  return <div className={USER}>{blocks.map((b) => (b.kind === 'text' ? b.text : '')).join('')}</div>
}

// The ink square that sends (or stops): no hover change, grey and opaque when disabled.
const SEND = 'rounded-[8px] hover:bg-primary disabled:bg-line-strong disabled:opacity-100'

function stepOf(e: KeyboardEvent): number {
  if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) return 1
  if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) return -1
  return 0
}

export function ChatView({
  commands,
  cwd,
  onAnswer,
  onCommand,
  onInterrupt,
  onSend,
  state,
}: Props) {
  const [draft, setDraft] = useState('')
  // The `/` menu: its highlighted row, and the draft Esc closed it on (it stays shut until
  // the draft changes).
  const [hot, setHot] = useState(0)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const menuId = useId()
  const scroller = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLTextAreaElement>(null)
  // Follow the conversation unless the user scrolled up to read.
  const pinned = useRef(true)
  const working = state.status === 'working' || state.status === 'starting'
  const permission = state.pending[0]

  useLayoutEffect(() => {
    const el = scroller.current
    if (el && pinned.current) el.scrollTop = el.scrollHeight
  }, [state.turns, state.pending])

  useEffect(() => {
    if (permission === undefined) field.current?.focus()
  }, [permission])

  useLayoutEffect(() => {
    const el = field.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`
  }, [draft])

  const typing = /^\/(\S*)$/.exec(draft)
  const menu =
    typing && draft !== dismissed && state.status !== 'exited'
      ? rankCommands(commands, typing[1] ?? '')
      : []
  // The commands can change under an open menu (the chat's own list arrives).
  const at = Math.min(hot, Math.max(menu.length - 1, 0))
  const chosen = parseCommand(draft)
  const hint =
    menu.length === 0 && chosen && /\s/.test(draft) && !draft.includes('\n')
      ? commands.find((c) => c.name === chosen.name && c.argumentHint !== '')
      : undefined

  const edit = (text: string) => {
    setDraft(text)
    setHot(0)
  }

  const submit = (line = draft) => {
    const text = line.trim()
    if (text === '' || state.status === 'exited') return
    pinned.current = true
    const command = parseCommand(text)
    if (command && isAppCommand(command.name)) onCommand(command.name, command.args)
    else onSend(text)
    edit('')
  }

  /** A command with arguments waits for them; one without runs. */
  const accept = (command: SlashCommand) => {
    if (command.argumentHint === '') submit(`/${command.name}`)
    else edit(`/${command.name} `)
  }

  const onMenuKey = (e: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    const step = stepOf(e)
    const command = menu[at]
    if (step !== 0) setHot((at + step + menu.length) % menu.length)
    else if (e.key === 'Escape') setDismissed(draft)
    else if (command && e.key === 'Tab') edit(`/${command.name} `)
    else if (command && e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      // A name typed in full runs as typed; a partial one is completed first.
      if (command.name === typing?.[1]) submit()
      else accept(command)
    } else return false
    e.preventDefault()
    return true
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (menu.length > 0 && onMenuKey(e)) return
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    } else if (e.key === 'Escape' && working) {
      e.preventDefault()
      onInterrupt()
    }
  }

  const last = state.turns.at(-1)
  const streamingText = last?.role === 'assistant' && last.blocks.at(-1)?.kind === 'text'
  const name = cwd.split('/').pop() ?? cwd

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className="min-h-0 flex-1 overflow-auto"
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
        }}
      >
        <div className="mx-auto flex max-w-[780px] flex-col gap-[18px] px-7 pt-7 pb-5 select-text">
          {state.turns.length === 0 && (
            <div className="flex flex-col items-center gap-1.5 pt-[120px] text-center text-sm text-faint">
              <MessageCircleIcon className="mb-1.5 size-[22px] p-0.5 text-label" />
              <span className="text-[16px] font-semibold text-balance text-foreground">
                What are we doing in {name}?
              </span>
              <span className="text-faint">
                Claude Code, in this workspace’s folder. Enter sends, Esc stops.
              </span>
            </div>
          )}
          {state.turns.map((turn) =>
            turn.role === 'user' ? (
              <UserTurn key={turn.id} blocks={turn.blocks} />
            ) : (
              <div
                key={turn.id}
                className="flex min-w-0 flex-col gap-2.5 *:animate-in *:fade-in *:slide-in-from-bottom-[6px] *:duration-280 *:ease-[cubic-bezier(0.2,0,0,1)]"
              >
                {turn.blocks.map((block, i) => (
                  // oxlint-disable-next-line react/no-array-index-key -- blocks keep their stream index
                  <BlockView
                    key={i}
                    block={block}
                    cwd={cwd}
                    live={working && turn === last && i === turn.blocks.length - 1}
                  />
                ))}
              </div>
            )
          )}
          {working && !streamingText && permission === undefined && (
            <div className="flex w-max animate-[shimmer_2.2s_linear_infinite] items-center gap-2 bg-[linear-gradient(90deg,var(--faint)_0%,var(--faint)_40%,var(--foreground)_50%,var(--faint)_60%,var(--faint)_100%)] bg-[length:300%_100%] bg-clip-text text-transparent">
              <span className={SPINNER} />
              {state.status === 'starting' ? 'Starting Claude…' : 'Working…'}
            </div>
          )}
          {state.lastTurn && !working && (
            <div className="-mt-2 font-mono text-[11px] text-label">
              {(state.lastTurn.durationMs / 1000).toFixed(1)}s · $
              {state.lastTurn.costUsd.toFixed(3)}
            </div>
          )}
          {state.errors.length > 0 && (
            <div className="rounded-[8px] bg-critical/7 px-3 py-2.5 text-[12.5px] whitespace-pre-wrap text-[#a2301f]">
              {state.errors.at(-1)}
            </div>
          )}
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-[812px] flex-none flex-col gap-2 px-4 pb-4">
        {permission !== undefined && (
          <PermissionCard cwd={cwd} permission={permission} onAnswer={onAnswer} />
        )}
        {/* The `/` menu floats over the composer: the composer itself never moves. */}
        <div
          data-composer
          className="relative flex flex-col rounded-[14px] border bg-[#f8f6f3] transition-[border-color,box-shadow] duration-150 ease-[ease] focus-within:border-[color-mix(in_srgb,var(--tan)_55%,var(--border))] focus-within:shadow-[0_0_0_4px_color-mix(in_srgb,var(--tan)_14%,transparent)]"
        >
          {menu.length > 0 && (
            <CommandMenu id={menuId} items={menu} hot={at} onHover={setHot} onPick={accept} />
          )}
          {hint && <CommandHint command={hint} />}
          <Textarea
            ref={field}
            className="min-h-12 rounded-none border-0 bg-transparent px-4 pt-3.5 pb-1 text-[14px] leading-[1.5] field-sizing-fixed placeholder:text-label focus-visible:ring-0 disabled:opacity-100"
            rows={1}
            value={draft}
            placeholder={
              state.status === 'exited'
                ? 'Claude has stopped'
                : 'Ask Claude, or type / for a command'
            }
            disabled={state.status === 'exited'}
            role="combobox"
            aria-expanded={menu.length > 0}
            aria-controls={menuId}
            aria-autocomplete="list"
            aria-activedescendant={menu.length > 0 ? `${menuId}-${at}` : undefined}
            onChange={(e) => edit(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <div className="flex items-center gap-2 pt-1.5 pr-2 pb-2 pl-4 text-[12px]">
            <span className="text-faint">{state.model ?? 'claude'}</span>
            <span className="min-w-0 flex-1" />
            {working ? (
              <Button
                size="icon"
                className={SEND}
                aria-label="Stop (Esc)"
                data-tip="Stop · Esc"
                data-tip-side="top"
                onClick={onInterrupt}
              >
                <SquareIcon className="size-[10px] fill-current" />
              </Button>
            ) : (
              <Button
                size="icon"
                className={SEND}
                aria-label="Send (Enter)"
                data-tip="Send · Enter"
                data-tip-side="top"
                disabled={draft.trim() === ''}
                onClick={() => submit()}
              >
                <ArrowUpIcon className="size-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
