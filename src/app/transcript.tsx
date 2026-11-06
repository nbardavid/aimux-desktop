import { openUrl } from '@tauri-apps/plugin-opener'
import {
  BotIcon,
  BrainIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CopyIcon,
  FileCodeIcon,
  FileImageIcon,
  FilePenIcon,
  FileTextIcon,
  GlobeIcon,
  type LucideIcon,
  SquareTerminalIcon,
} from 'lucide-react'
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

import {
  type Block,
  type ChangedFile,
  changedFiles,
  type ChatState,
  type Exchange,
  exchanges,
  exitCode,
  formatDuration,
  groupSummary,
  type Item,
  type Keyed,
  numberedLines,
  type ToolKind,
  toolSummary,
  type Turn,
  type TurnEnd,
} from '../chat/model'
import { Minimap, type Prompt } from './minimap'

/** Copies on click and shows a check for 1.2s. `text` is read at the click. */
function CopyButton({
  className,
  label,
  text,
}: {
  text: () => string
  label: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1200)
    return () => clearTimeout(timer)
  }, [copied])
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            data-ui
            className={cn(
              'text-faint hover:bg-hover hover:text-foreground inline-flex size-6 flex-none items-center justify-center rounded-md transition-[color,background-color,opacity] duration-120',
              copied && 'text-foreground opacity-100',
              className
            )}
            aria-label={copied ? 'Copied' : label}
            onClick={() => {
              void navigator.clipboard.writeText(text())
              setCopied(true)
            }}
          />
        }
      >
        {/* The icon cross-fades in place. */}
        <span key={String(copied)} className="animate-in fade-in duration-120">
          {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">{copied ? 'Copied' : label}</TooltipContent>
    </Tooltip>
  )
}

/** A fenced code block, with Copy at its top right on hover or focus. */
function CodeBlock({ children }: { children: ReactNode }) {
  const pre = useRef<HTMLPreElement>(null)
  return (
    <div data-ui className="group/code relative mb-3 last:mb-0">
      <pre ref={pre} className="m-0">
        {children}
      </pre>
      <CopyButton
        label="Copy"
        className="bg-chrome absolute top-1.5 right-1.5 opacity-0 group-hover/code:opacity-100 focus-visible:opacity-100"
        text={() => pre.current?.textContent ?? ''}
      />
    </div>
  )
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
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
}

// How a message or a block comes in: a short rise. (Written out whole: Tailwind only sees
// complete class names.)
export const ENTER =
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
// A <details> header inside a group: a grey row under the pointer, no marker.
const SUMMARY =
  'flex h-7 cursor-pointer list-none items-center gap-2 rounded-md px-2 text-faint transition-colors duration-120 hover:bg-hover hover:text-foreground [&::-webkit-details-marker]:hidden'

const PLUGINS = [remarkGfm]

// A command's output past this many lines folds, with "Show all".
const OUTPUT_LINES = 12

// 20px lines: 12 of them, or (`/context`) its title and totals, the table on demand.
const FOLDED = 'max-h-[240px]'
const COLLAPSED = 'max-h-[90px]'

function OutputCard({ collapsed = false, text }: { text: string; collapsed?: boolean }) {
  const long = collapsed || text.split('\n').length > OUTPUT_LINES
  const [open, setOpen] = useState(false)
  return (
    <div className="bg-chrome text-ink-soft relative rounded-lg px-4 py-3">
      <div
        className={cn(
          'md text-[13.5px] leading-5',
          long &&
            !open &&
            'overflow-hidden [mask-image:linear-gradient(to_bottom,#000_70%,transparent)]',
          long && !open && (collapsed ? COLLAPSED : FOLDED)
        )}
      >
        <Markdown remarkPlugins={PLUGINS} components={MD}>
          {text}
        </Markdown>
      </div>
      {long && (
        <button
          type="button"
          className="text-faint hover:text-foreground mt-1.5 text-xs font-medium transition-colors duration-120"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? 'Show less' : 'Show all'}
        </button>
      )}
    </div>
  )
}

const TOOL_OUT = `my-1 max-h-[320px] overflow-auto rounded-lg border bg-chrome px-3 py-2.5 font-mono text-xs leading-[18px] whitespace-pre-wrap wrap-anywhere ${OPENING}`

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
  const text = result?.text ?? ''
  const failed = result?.isError === true
  // Read: the file's lines on a narrow gutter, no input to repeat.
  const lines = name === 'Read' && !failed ? numberedLines(text) : null
  if (lines) {
    return (
      <pre className={cn(TOOL_OUT, 'grid grid-cols-[auto_1fr] gap-x-3')}>
        {lines.map((l) => (
          <div key={l.n} className="contents">
            <span className="text-faint text-right tabular-nums select-none">{l.n}</span>
            <span>{l.text}</span>
          </div>
        ))}
      </pre>
    )
  }
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  // What was asked, above what came back: the command, the pattern, or (an unknown tool) the
  // input as JSON. Read's path is already in the row.
  let asked: string | null = JSON.stringify(input, null, 2)
  if (name === 'Bash') asked = `$ ${str(input.command)}`
  else if (name === 'Grep' || name === 'Glob') {
    const where = str(input.path) || str(input.glob)
    asked = where === '' ? str(input.pattern) : `${str(input.pattern)}  in ${where}`
  } else if (name === 'Read') asked = null
  const { body, code } = failed ? exitCode(text) : { body: text, code: null }
  return (
    <pre className={cn(TOOL_OUT, failed && 'bg-critical/5')}>
      {asked !== null && (
        <span className={cn(name !== 'Bash' && 'text-faint')}>
          {asked}
          {body !== '' && '\n\n'}
        </span>
      )}
      {body}
      {code !== null && <span className="text-critical">{`\nexit code ${code}`}</span>}
    </pre>
  )
}

function ToolRow({ block, cwd }: { block: Block & { kind: 'tool' }; cwd: string }) {
  let dot = SPINNER
  if (block.result) {
    dot = block.result.isError
      ? cn(DOT, 'bg-critical')
      : cn(DOT, 'animate-[pop_0.3s_cubic-bezier(0.2,0,0,1)] bg-good')
  } else if (block.stopped === true) dot = cn(DOT, 'border-faint border-[1.5px]')
  return (
    <details>
      <summary className={SUMMARY}>
        <span className={dot} />
        <span className="text-foreground flex-none font-medium">{block.name}</span>
        <span className="truncate font-mono text-xs">
          {toolSummary(block.name, block.input, cwd)}
        </span>
      </summary>
      <ToolBody block={block} />
    </details>
  )
}

function Thought({ text }: { text: string }) {
  return (
    <details>
      <summary className={cn(SUMMARY, 'w-max italic')}>Thought</summary>
      <div
        className={cn(
          'text-muted-foreground ml-2 border-l-2 pt-1 pr-2 pb-1.5 pl-4 text-sm whitespace-pre-wrap',
          OPENING
        )}
      >
        {text}
      </div>
    </details>
  )
}

/** A block outside any group: Claude's answer (or what it is writing), a card, a note. */
function BlockView({
  block,
  collapsed,
  live,
}: {
  block: Block
  live: boolean
  collapsed: boolean
}) {
  if (block.kind === 'text') {
    return (
      <div className={cn('md', live && CARET)}>
        <Markdown remarkPlugins={PLUGINS} components={MD}>
          {block.text}
        </Markdown>
      </div>
    )
  }
  if (block.kind === 'output') return <OutputCard text={block.text} collapsed={collapsed} />
  if (block.kind === 'note') return <div className="text-faint mt-1 text-xs">{block.text}</div>
  return null
}

/** A block folded into a group: a tool row, a thought, or an intermediate message. */
function FoldedBlock({ block, cwd }: { block: Block; cwd: string }) {
  if (block.kind === 'tool') return <ToolRow block={block} cwd={cwd} />
  if (block.kind === 'thinking') return <Thought text={block.text} />
  if (block.kind === 'text') {
    return (
      <div className="md text-muted-foreground py-1 pl-2 text-base">
        <Markdown remarkPlugins={PLUGINS} components={MD}>
          {block.text}
        </Markdown>
      </div>
    )
  }
  return null
}

/** Height and fade, 180ms, no jump (DESIGN.md expand/collapse). Closed, it is inert. */
function Collapse({ children, open }: { open: boolean; children: ReactNode }) {
  return (
    <div
      className={cn(
        'grid transition-[grid-template-rows,opacity] duration-180 ease-in-out',
        open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
      )}
      inert={!open}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  )
}

const KIND_ICONS: Record<ToolKind, LucideIcon> = {
  agent: BotIcon,
  bash: SquareTerminalIcon,
  edit: FilePenIcon,
  read: FileTextIcon,
  thinking: BrainIcon,
  web: GlobeIcon,
}

/** One grey row for a run of work; open, the run under it. Its last `shown` rows stay out. */
function ToolGroup({ blocks, cwd, shown }: { blocks: Keyed[]; cwd: string; shown: number }) {
  const [open, setOpen] = useState(false)
  const { failed, kinds, label } = groupSummary(blocks.map((k) => k.block))
  return (
    <div className="flex flex-col">
      <button
        type="button"
        className="group/row text-faint hover:text-muted-foreground flex h-7 w-max max-w-full items-center gap-1.5 rounded-md text-base transition-colors duration-120"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <ChevronRightIcon
          className={cn(
            'text-label group-hover/row:text-muted-foreground size-3.5 flex-none transition-[rotate,color] duration-180 ease-in-out',
            open && 'rotate-90'
          )}
        />
        <span className="truncate">
          {label}
          {failed > 0 && <span className="text-critical-ink"> · {failed} failed</span>}
        </span>
        {kinds.length > 0 && (
          <span className="text-label ml-0.5 flex flex-none items-center gap-1">
            {kinds.map((kind) => {
              const Icon = KIND_ICONS[kind]
              return <Icon key={kind} className="size-3.5" />
            })}
          </span>
        )}
      </button>
      <div className="flex flex-col pl-3">
        {blocks.map((k, i) => (
          <Collapse key={k.key} open={open || i >= blocks.length - shown}>
            <div className="py-px">
              <FoldedBlock block={k.block} cwd={cwd} />
            </div>
          </Collapse>
        ))}
      </div>
    </div>
  )
}

const USER = `max-w-[80%] self-end rounded-lg bg-bubble px-3.5 py-[11px] text-base text-ink-soft whitespace-pre-wrap wrap-anywhere ${ENTER}`

/** What a prompt says, as one line of text: the ruler's tooltip. */
export function promptText(turn: Turn): string {
  const first = turn.blocks[0]
  if (first?.kind === 'command') return `/${first.name}${first.args === '' ? '' : ` ${first.args}`}`
  return turn.blocks.map((b) => (b.kind === 'text' ? b.text : '')).join('')
}

function UserTurn({ turn }: { turn: Turn }) {
  const first = turn.blocks[0]
  if (first?.kind === 'command') {
    return (
      <div data-prompt={turn.id} className={cn(USER, 'font-mono text-sm leading-[22px]')}>
        <span className="text-foreground font-semibold">/{first.name}</span>
        {first.args !== '' && ` ${first.args}`}
      </div>
    )
  }
  return (
    <div data-prompt={turn.id} className={USER}>
      {promptText(turn)}
    </div>
  )
}

/**
 * Prompts sent while Claude works: pinned above the composer, faded, until Claude takes them.
 * The text ones wait as one bubble, as Claude takes them; a slash command waits alone.
 */
export function QueuedPrompts({ turns }: { turns: Turn[] }) {
  // Claude takes every text prompt first, as one; each command after, on its own.
  const command = (t: Turn) => t.blocks[0]?.kind === 'command'
  const texts = turns.filter((t) => !command(t))
  const groups = [texts, ...turns.filter(command).map((t) => [t])].filter((g) => g.length > 0)
  return groups.map((group) => (
    // The transcript's column, not the composer's (16px wider, 8px less inset): its right
    // edge on the transcript's bubbles at any width.
    <div
      key={group[0]?.id}
      className="-mx-4 flex justify-center"
      aria-label={group.length > 1 ? `${group.length} queued prompts` : 'Queued prompt'}
    >
      <div className="flex w-full max-w-[768px] flex-col items-end gap-1 px-6">
        <span className="text-faint text-xs">
          {group.length > 1 ? `${group.length} queued, sent as one` : 'Queued'}
        </span>
        <div className={cn(USER, 'flex flex-col gap-2 opacity-60')}>
          {group.map((t) => (
            <p key={t.id} className="line-clamp-3">
              {promptText(t)}
            </p>
          ))}
        </div>
      </div>
    </div>
  ))
}

const CHIP =
  'group/chip inline-flex h-6 max-w-full items-center gap-1.5 rounded-md border bg-background px-2 transition-colors duration-120 hover:border-line-strong'

function FileIcon({ path }: { path: string }) {
  const cls = 'text-label size-[13px] flex-none'
  if (/\.(png|jpe?g|gif|svg|webp|ico|icns|avif)$/i.test(path))
    return <FileImageIcon className={cls} />
  if (/\.(md|mdx|txt|rst|csv|log)$/i.test(path) || !/\.[a-z0-9]+$/i.test(path))
    return <FileTextIcon className={cls} />
  return <FileCodeIcon className={cls} />
}

function FileChip({ file, onOpen }: { file: ChangedFile; onOpen?: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<button type="button" className={CHIP} onClick={onOpen} />}>
        <FileIcon path={file.path} />
        <span className="text-muted-foreground group-hover/chip:text-foreground truncate text-xs transition-colors duration-120">
          {file.path.split('/').pop()}
        </span>
        <span className="flex-none font-mono text-[11.5px] tabular-nums">
          {file.added > 0 && <span className="text-good">+{file.added}</span>}
          {file.added > 0 && file.removed > 0 && ' '}
          {file.removed > 0 && <span className="text-critical">−{file.removed}</span>}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="font-mono">
        {file.path}
      </TooltipContent>
    </Tooltip>
  )
}

// The footer shows this many file chips, then "+n files".
const CHIPS = 6

const cost = (usd: number) => (usd < 0.01 ? '<$0.01' : `$${usd.toFixed(2)}`)

/** Under a finished exchange: how long, how much, Copy, and the files it changed. */
function TurnFooter({
  answer,
  end,
  files,
  onOpenFile,
  worked,
}: {
  answer: string
  end: TurnEnd
  files: ChangedFile[]
  /** Claude worked (a message or a tool), so its length means something. */
  worked: boolean
  onOpenFile?: (path: string | null) => void
}) {
  const more = files.length - CHIPS
  const timed = worked && end.durationMs > 0
  // A command's card alone (no time, no cost, no file): a lone Copy would only be noise.
  if (!end.stopped && !timed && end.costUsd <= 0 && files.length === 0) return null
  return (
    <div className="text-faint -mt-1 flex min-h-7 flex-wrap items-center gap-2 text-xs">
      {end.stopped ? (
        <span>Stopped</span>
      ) : (
        <>
          {timed && <span className="tabular-nums">{formatDuration(end.durationMs)}</span>}
          {end.costUsd > 0 && <span className="tabular-nums">{cost(end.costUsd)}</span>}
        </>
      )}
      {answer !== '' && <CopyButton label="Copy answer" text={() => answer} />}
      {files.slice(0, CHIPS).map((file) => (
        <FileChip key={file.path} file={file} onOpen={() => onOpenFile?.(file.path)} />
      ))}
      {more > 0 && (
        <button
          type="button"
          className={cn(CHIP, 'text-muted-foreground hover:text-foreground text-xs')}
          onClick={() => onOpenFile?.(null)}
        >
          +{more} files
        </button>
      )}
    </div>
  )
}

function ExchangeView({
  cwd,
  exchange,
  onOpenFile,
}: {
  exchange: Exchange
  cwd: string
  onOpenFile?: (path: string | null) => void
}) {
  const { answer, blocks, end, items, live, user } = exchange
  // What `/context` printed: its card starts folded to the totals.
  const first = user?.blocks[0]
  const collapsed = first?.kind === 'command' && first.name === 'context'
  const lastBlock = blocks.at(-1)
  const worked = items.some((i) => i.kind === 'group' || i.block.kind === 'text')
  const footer = !live && end !== null && (items.length > 0 || end.stopped)
  const item = (it: Item) =>
    it.kind === 'group' ? (
      <div key={it.key} className={ENTER}>
        <ToolGroup blocks={it.blocks} cwd={cwd} shown={it.shown} />
      </div>
    ) : (
      <div key={it.key} className={ENTER}>
        <BlockView block={it.block} live={live && it.block === lastBlock} collapsed={collapsed} />
      </div>
    )
  return (
    <>
      {user && <UserTurn turn={user} />}
      {(items.length > 0 || footer) && (
        <div className="flex min-w-0 flex-col gap-3">
          {items.map(item)}
          {footer && (
            <TurnFooter
              answer={answer}
              end={end}
              files={changedFiles(blocks, cwd)}
              worked={worked}
              onOpenFile={onOpenFile}
            />
          )}
        </div>
      )}
    </>
  )
}

function status(state: ChatState): string {
  if (state.stopping) return 'Stopping…'
  if (state.status === 'starting') return 'Starting Claude…'
  return state.turns.at(-1)?.blocks.at(-1)?.kind === 'thinking' ? 'Thinking…' : 'Working…'
}

const smooth = (): ScrollBehavior =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'

interface Props {
  cwd: string
  state: ChatState
  /** An old background host holds the chats: the transcript shows, nothing runs. */
  blocked: boolean
  /** Under the empty chat's question, in place of how the chat works. */
  intro?: ReactNode
  /** The workspace's name; its folder's by default. */
  place?: string
  /** A footer's file chip: git mode on that file (relative path), or on all (`null`). */
  onOpenFile?: (path: string | null) => void
}

/**
 * Keeps a pinned column at its bottom when it or its content changes size: a composer that
 * grows, a shorter window, a block that unfolds. Returns the disconnect.
 */
export function stickToBottom(
  scroller: { scrollTop: number; scrollHeight: number } & Element,
  content: Element,
  pinned: () => boolean,
  Observer: typeof ResizeObserver = ResizeObserver
): () => void {
  const observer = new Observer(() => {
    if (pinned()) scroller.scrollTop = scroller.scrollHeight
  })
  observer.observe(scroller)
  observer.observe(content)
  return () => observer.disconnect()
}

interface Scrolled {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}

/**
 * Whether the column still follows after a scroll event. One that comes with a size change
 * (a shorter window, a taller composer, reflowed text) is the layout's, not the reader's: it
 * keeps a pinned column pinned, and the resize observer takes it back to the bottom.
 */
export function pinnedAfterScroll(
  was: boolean,
  before: { scrollHeight: number; clientHeight: number },
  el: Scrolled
): boolean {
  const resized = el.scrollHeight !== before.scrollHeight || el.clientHeight !== before.clientHeight
  if (was && resized) return true
  return el.scrollHeight - el.scrollTop - el.clientHeight < 48
}

/** The chat's scrolling column: the exchanges, what is running, the last error. */
export function Transcript({ blocked, cwd, intro, onOpenFile, place, state }: Props) {
  const scroller = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  // Follow the conversation unless the user scrolled up to read (the ref, for the layout
  // effect; the state, for the ↓ button).
  const pinned = useRef(true)
  // The column's size at the last scroll event: tells a reader's scroll from a resize's.
  const size = useRef({ clientHeight: 0, scrollHeight: 0 })
  const [following, setFollowing] = useState(true)
  const working = state.status === 'working' || state.status === 'starting'
  const permission = state.pending[0]

  // Sending follows the conversation again.
  const prompts: Prompt[] = state.turns
    .filter((t) => t.role === 'user')
    .map((t) => ({ id: t.id, text: promptText(t) }))
  useLayoutEffect(() => {
    pinned.current = true
    setFollowing(true)
  }, [prompts.length])

  // "Stopping…" and the error count too: they appear below the last exchange; a question or a
  // queued prompt over the composer shrinks the column.
  useLayoutEffect(() => {
    const el = scroller.current
    if (el && pinned.current) el.scrollTop = el.scrollHeight
  }, [state.turns, state.pending, state.queued, state.stopping, state.status, state.errors])
  useEffect(() => {
    const el = scroller.current
    const inner = content.current
    if (el && inner) return stickToBottom(el, inner, () => pinned.current)
  }, [])

  const last = state.turns.at(-1)
  const streamingText = last?.role === 'assistant' && last.blocks.at(-1)?.kind === 'text'
  const name = place ?? cwd.split('/').pop() ?? cwd
  const empty = state.turns.length === 0 && !blocked

  const toLatest = () => {
    const el = scroller.current
    if (!el) return
    pinned.current = true
    setFollowing(true)
    el.scrollTo({ behavior: smooth(), top: el.scrollHeight })
  }

  return (
    <div className="@container relative flex min-h-0 flex-1 flex-col">
      <div
        className="min-h-0 flex-1 overflow-auto"
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget
          pinned.current = pinnedAfterScroll(pinned.current, size.current, el)
          size.current = { clientHeight: el.clientHeight, scrollHeight: el.scrollHeight }
          setFollowing(pinned.current)
        }}
      >
        <div
          ref={content}
          className={cn(
            'mx-auto flex max-w-[768px] flex-col gap-6 px-6 pt-7 pb-6 select-text',
            empty && 'min-h-full'
          )}
        >
          {empty && (
            // The question sits at 30% of the pane.
            <div className="flex flex-1 flex-col items-center text-center">
              <span className="flex-[3_3_0]" />
              <span className="text-foreground text-lg text-balance">
                What are we doing in {name}?
              </span>
              <span className="text-faint mt-1.5 text-base text-balance">
                {intro ?? 'Claude Code, in this workspace’s folder. Enter sends, Esc stops.'}
              </span>
              <span className="flex-[7_7_0]" />
            </div>
          )}
          {exchanges(state.turns, working, new Set(state.pending.map((p) => p.toolUseId))).map(
            (exchange) => (
              <ExchangeView
                key={exchange.key}
                exchange={exchange}
                cwd={cwd}
                onOpenFile={onOpenFile}
              />
            )
          )}
          {((working && !streamingText && permission === undefined) || state.stopping) && (
            <div className="flex w-max animate-[shimmer_2.2s_linear_infinite] items-center gap-2 bg-[linear-gradient(90deg,var(--faint)_0%,var(--faint)_40%,var(--foreground)_50%,var(--faint)_60%,var(--faint)_100%)] bg-[length:300%_100%] bg-clip-text text-base text-transparent">
              <span className={SPINNER} />
              {status(state)}
            </div>
          )}
          {state.errors.length > 0 && (
            <div className="bg-critical-wash text-critical-ink rounded-lg px-3 py-2.5 text-sm leading-5 whitespace-pre-wrap">
              {state.errors.at(-1)}
            </div>
          )}
        </div>
      </div>
      <Minimap scroller={scroller} prompts={prompts} />
      {/* Scrolled up, the text fades out under the ↓ instead of running into it. */}
      <div
        className={cn(
          'from-background pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-linear-to-t to-transparent transition-opacity',
          following ? 'opacity-0 duration-100 ease-in' : 'opacity-100 duration-140 ease-out'
        )}
      />
      {/* ↓: 8px above the composer (or the question over it), centred on the column, over
          the fade; in the left gutter, beside the 720px column, once there is room for it. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-2 mx-auto flex w-full max-w-[768px] justify-center px-6 @min-[840px]:justify-start">
        <button
          type="button"
          aria-label="Jump to latest"
          aria-hidden={following}
          tabIndex={following ? -1 : 0}
          className={cn(
            'bg-background text-faint hover:bg-hover hover:text-foreground inline-flex size-7 items-center justify-center rounded-md border transition-[color,background-color] duration-120 @min-[840px]:-ml-11',
            following
              ? 'opacity-0 transition-opacity duration-100 ease-in'
              : 'animate-in fade-in slide-in-from-bottom-[4px] pointer-events-auto duration-140 ease-out'
          )}
          onClick={toLatest}
        >
          <ChevronDownIcon className="size-3.5" />
        </button>
      </div>
    </div>
  )
}
