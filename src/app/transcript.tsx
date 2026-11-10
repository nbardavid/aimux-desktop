import { openUrl } from '@tauri-apps/plugin-opener'
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CopyIcon,
  FileCodeIcon,
  FileImageIcon,
  FileTextIcon,
  PencilIcon,
  XIcon,
} from 'lucide-react'
import { memo, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { Kbd } from '@/components/ui/kbd'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

import {
  agentRun,
  type AgentRun,
  type Block,
  type ChangedFile,
  changedFiles,
  type ChatState,
  type Exchange,
  exchanges,
  exitCode,
  formatDuration,
  groupSummary,
  isAgentCall,
  isFileEdit,
  type Item,
  type Keyed,
  liveStep,
  numberedLines,
  toolSummary,
  type Turn,
  type TurnEnd,
} from '../chat/model'
import { AgentCard } from './agents'
import { BrailleSpinner } from './braille-spinner'
import { ImageStrip } from './image-strip'
import { useLoaderChoice } from './loader-choice'
import { useSmoothText } from './smooth-text'
import { Dot } from './status-dot'
import { useWindow } from './use-window'

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
// Status dots, as status-dot.tsx draws them.
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

/** What a file write changed, line by line: removed lines, then added ones, edit by edit. */
function diffOf(name: string, input: Record<string, unknown>) {
  const str = (v: unknown) => (typeof v === 'string' ? v : null)
  const lines = (text: string, added: boolean) =>
    text
      .replace(/\n$/, '')
      .split('\n')
      .map((t) => ({ added, text: t }))
  const pair = (e: Record<string, unknown>) => {
    const before = str(e.old_string)
    const after = str(e.new_string)
    return before === null || after === null ? [] : [...lines(before, false), ...lines(after, true)]
  }
  if (name === 'Edit') return pair(input)
  if (name === 'MultiEdit' && Array.isArray(input.edits))
    return input.edits.flatMap((e) =>
      typeof e === 'object' && e !== null ? pair(e as Record<string, unknown>) : []
    )
  const content = name === 'Write' ? str(input.content) : str(input.new_source)
  return content === null ? null : lines(content, true)
}

/**
 * A file Claude wrote, as a badge: its name and what changed. A click unfolds the diff under
 * it, drawn on the first opening only.
 */
const FileEditBadge = memo(function FileEditBadge({
  block,
  cwd,
}: {
  block: Block & { kind: 'tool' }
  cwd: string
}) {
  const [open, setOpen] = useState(false)
  const [opened, setOpened] = useState(false)
  const path = toolSummary(block.name, block.input, cwd)
  const slash = path.lastIndexOf('/')
  const counts = changedFiles([block], cwd)[0]
  const failed = block.result?.isError === true
  const writing = block.result === undefined && block.stopped !== true
  return (
    <div className="flex flex-col">
      <button
        type="button"
        aria-expanded={open}
        className={cn(
          'group/badge hover:border-line-strong hover:bg-hover flex h-7 w-max max-w-full items-center gap-2 rounded-md border px-2 text-sm transition-colors duration-120',
          open && 'bg-hover border-line-strong'
        )}
        onClick={() => {
          setOpened(true)
          setOpen((o) => !o)
        }}
      >
        {writing ? (
          <Dot tone="working" />
        ) : (
          <PencilIcon className="text-faint size-3.5 flex-none" />
        )}
        <span className="text-foreground truncate font-mono text-xs" title={path}>
          {path.slice(slash + 1)}
        </span>
        {failed && <span className="text-critical-ink text-xs">failed</span>}
        {!failed && counts && (
          <span className="flex-none font-mono text-xs tabular-nums">
            {counts.added > 0 && <span className="text-good-ink">+{counts.added}</span>}
            {counts.added > 0 && counts.removed > 0 && ' '}
            {counts.removed > 0 && <span className="text-critical-ink">−{counts.removed}</span>}
          </span>
        )}
        <ChevronRightIcon
          className={cn(
            'text-label group-hover/badge:text-muted-foreground size-3 flex-none transition-[rotate,color] duration-180 ease-in-out',
            open && 'rotate-90'
          )}
        />
      </button>
      <Collapse open={open}>{opened && <ToolBody block={block} />}</Collapse>
    </div>
  )
})

function ToolBody({ block }: { block: Block & { kind: 'tool' } }) {
  const { input, name, result } = block
  const diff = diffOf(name, input)
  if (diff) {
    return (
      <pre className={TOOL_OUT}>
        {diff.map((line, i) => (
          // oxlint-disable-next-line react/no-array-index-key -- lines are positional
          <div key={i} className={line.added ? 'bg-good/9' : 'bg-critical/8'}>
            {line.added ? '+' : '−'} {line.text}
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

const ToolRow = memo(function ToolRow({
  block,
  cwd,
}: {
  block: Block & { kind: 'tool' }
  cwd: string
}) {
  let dot = <Dot tone="working" />
  if (block.result) {
    const done = block.result.isError
      ? cn(DOT, 'bg-critical')
      : cn(DOT, 'animate-[pop_0.3s_cubic-bezier(0.2,0,0,1)] bg-good')
    dot = <span className={done} />
  } else if (block.stopped === true)
    dot = <span className={cn(DOT, 'border-faint border-[1.5px]')} />
  // Its body (a whole file, a long output) is drawn once it is first opened, never before.
  const [seen, setSeen] = useState(false)
  return (
    <details onToggle={(e) => e.currentTarget.open && setSeen(true)}>
      <summary className={SUMMARY}>
        {dot}
        <span className="text-foreground flex-none font-medium">{block.name}</span>
        <span className="truncate font-mono text-xs">
          {toolSummary(block.name, block.input, cwd)}
        </span>
      </summary>
      {seen && <ToolBody block={block} />}
    </details>
  )
})

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

/** Claude's answer, revealed at a steady pace while it is being written. */
function AnswerText({ live, text }: { live: boolean; text: string }) {
  const shown = useSmoothText(text, live)
  return (
    <div className="md">
      <Markdown remarkPlugins={PLUGINS} components={MD}>
        {shown}
      </Markdown>
    </div>
  )
}

/** A block outside any group: Claude's answer (or what it is writing), a card, a note. */
const BlockView = memo(function BlockView({
  block,
  collapsed,
  live,
}: {
  block: Block
  live: boolean
  collapsed: boolean
}) {
  if (block.kind === 'text') return <AnswerText text={block.text} live={live} />
  if (block.kind === 'output') return <OutputCard text={block.text} collapsed={collapsed} />
  if (block.kind === 'note') return <div className="text-faint mt-1 text-xs">{block.text}</div>
  return null
})

/** A block folded into a group: a tool row, a thought, or an intermediate message. */
const FoldedBlock = memo(function FoldedBlock({ block, cwd }: { block: Block; cwd: string }) {
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
})

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

/** One grey row for a run of work; open, the run under it. Its last `shown` rows stay out. */
function ToolGroup({ blocks, cwd, shown }: { blocks: Keyed[]; cwd: string; shown: number }) {
  const [open, setOpen] = useState(false)
  // Its rows are drawn from the first opening on (a long chat folds thousands of them).
  const [opened, setOpened] = useState(false)
  const { failed, label } = groupSummary(blocks.map((k) => k.block))
  return (
    <div className="flex flex-col">
      <button
        type="button"
        className="group/row text-faint hover:text-muted-foreground flex h-7 w-max max-w-full items-center gap-1.5 rounded-md text-base transition-colors duration-120"
        aria-expanded={open}
        onClick={() => {
          setOpened(true)
          setOpen((o) => !o)
        }}
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
      </button>
      <div className="flex flex-col pl-3">
        {blocks.map((k, i) => {
          const out = i >= blocks.length - shown
          return (
            <Collapse key={k.key} open={open || out}>
              {(opened || out) && (
                <div className="py-px">
                  <FoldedBlock block={k.block} cwd={cwd} />
                </div>
              )}
            </Collapse>
          )
        })}
      </div>
    </div>
  )
}

const USER = `max-w-[80%] self-end rounded-lg bg-bubble px-3.5 py-[11px] text-base text-ink-soft whitespace-pre-wrap wrap-anywhere ${ENTER}`

/** What a prompt says, as one line of text: the ruler's tooltip. */
export function promptText(turn: Turn): string {
  const first = turn.blocks[0]
  if (first?.kind === 'command') return `/${first.name}${first.args === '' ? '' : ` ${first.args}`}`
  const text = turn.blocks.map((b) => (b.kind === 'text' ? b.text : '')).join('')
  const images = imagesIn(turn).length
  if (text !== '' || images === 0) return text
  return images === 1 ? 'An image' : `${images} images`
}

const imagesIn = (turn: Turn) =>
  turn.blocks.flatMap((b) => (b.kind === 'image' ? [{ data: b.data, mediaType: b.mediaType }] : []))

/** A prompt's images, over its bubble, at the bubble's right edge. */
const PromptImages = ({ turn }: { turn: Turn }) => (
  <ImageStrip images={imagesIn(turn)} className={cn('max-w-[80%] self-end justify-end', ENTER)} />
)

/** A `!` command: what was typed, at the right like a prompt; what it printed, under it. */
function ShellTurn({ block }: { block: Extract<Block, { kind: 'shell' }> }) {
  const failed = block.exitCode !== null && block.exitCode !== 0
  const loaders = useLoaderChoice()
  return (
    <div className="flex flex-col gap-2">
      <div className={cn(USER, 'font-mono text-sm leading-[22px]')}>
        <span className="text-faint">!</span> {block.command}
      </div>
      {block.output === null ? (
        <div className="text-faint flex h-7 items-center gap-2.5 text-base">
          <BrailleSpinner loader={loaders.working} className="text-[15px]" />
          <span className={SHIMMER}>Running…</span>
        </div>
      ) : (
        (block.output !== '' || failed) && (
          <div className={cn(TOOL_OUT, 'my-0', failed && 'text-critical-ink')}>
            {block.output}
            {failed && (
              <div className="text-critical-ink mt-1 opacity-80">exit {block.exitCode}</div>
            )}
          </div>
        )
      )}
    </div>
  )
}

function UserTurn({ turn }: { turn: Turn }) {
  const first = turn.blocks[0]
  if (first?.kind === 'shell') return <ShellTurn block={first} />
  if (first?.kind === 'command') {
    return (
      <div className={cn(USER, 'font-mono text-sm leading-[22px]')}>
        <span className="text-foreground font-semibold">/{first.name}</span>
        {first.args !== '' && ` ${first.args}`}
      </div>
    )
  }
  if (!turn.blocks.some((b) => b.kind === 'image'))
    return <div className={USER}>{promptText(turn)}</div>
  // The ruler marks the images and the words as one prompt.
  return (
    <div className="flex flex-col gap-2">
      <PromptImages turn={turn} />
      {turn.blocks.some((b) => b.kind === 'text') && <div className={USER}>{promptText(turn)}</div>}
    </div>
  )
}

/**
 * Prompts sent while Claude works: one line at the top of the composer until Claude takes
 * them. The text ones wait as one line, as Claude takes them together; a slash command
 * waits alone. Until Claude starts them they can be taken back: into the composer to edit
 * (↑ in an empty prompt, or Edit), or dropped (×).
 */
export function QueuedPrompts({
  onCancel,
  onEdit,
  turns,
}: {
  turns: Turn[]
  onEdit?: (turns: Turn[]) => void
  onCancel?: (turns: Turn[]) => void
}) {
  const command = (t: Turn) => t.blocks[0]?.kind === 'command'
  const texts = turns.filter((t) => !command(t))
  const groups = [texts, ...turns.filter(command).map((t) => [t])].filter((g) => g.length > 0)
  return groups.map((group) => {
    const images = group.reduce((n, t) => n + imagesIn(t).length, 0)
    const words = group
      .filter((t) => t.blocks.some((b) => b.kind === 'text' || b.kind === 'command'))
      .map(promptText)
    return (
      <div
        key={group[0]?.id}
        className="text-muted-foreground animate-in fade-in slide-in-from-bottom-[4px] flex h-[30px] items-center gap-2 border-b px-3 text-sm duration-160 ease-out"
        aria-label={group.length > 1 ? `${group.length} queued prompts` : 'Queued prompt'}
        data-tip={group.length > 1 ? `Sent as one:\n${words.join('\n')}` : words.join('\n')}
        data-tip-side="top"
      >
        <span className="bg-bubble text-faint flex-none rounded-sm px-1.5 text-2xs leading-[18px]">
          {group.length > 1 ? `${group.length} queued` : 'Queued'}
        </span>
        {images > 0 && (
          <span className="text-faint flex flex-none items-center gap-1 text-xs">
            <FileImageIcon className="size-3.5" />
            {images}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate">{words.join(' · ')}</span>
        {onEdit && (
          <button
            type="button"
            className="text-faint hover:text-foreground flex h-6 flex-none items-center gap-1.5 rounded-md px-1.5 text-xs transition-[color] duration-120"
            aria-label="Edit the queued prompt"
            onClick={() => onEdit(group)}
          >
            Edit
            <Kbd>↑</Kbd>
          </button>
        )}
        {onCancel && (
          <button
            type="button"
            className="text-faint hover:bg-hover hover:text-foreground -mr-1.5 grid size-6 flex-none place-items-center rounded-md transition-[background-color,color] duration-120"
            aria-label="Cancel the queued prompt"
            data-tip="Cancel"
            data-tip-side="top"
            onClick={() => onCancel(group)}
          >
            <XIcon className="size-3.5" />
          </button>
        )}
      </div>
    )
  })
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
  agentOf,
  cwd,
  exchange,
  onOpenAgent,
  onOpenFile,
}: {
  exchange: Exchange
  cwd: string
  agentOf: (id: string) => AgentRun | null
  onOpenAgent?: (id: string) => void
  onOpenFile?: (path: string | null) => void
}) {
  const { answer, blocks, end, items, live, user } = exchange
  // What `/context` printed: its card starts folded to the totals.
  const first = user?.blocks[0]
  const collapsed = first?.kind === 'command' && first.name === 'context'
  const lastBlock = blocks.at(-1)
  const worked = items.some((i) => i.kind === 'group' || i.block.kind === 'text')
  const footer = !live && end !== null && (items.length > 0 || end.stopped)
  const item = (it: Item) => {
    const run = it.kind === 'block' && isAgentCall(it.block) ? agentOf(it.block.id) : null
    if (run && onOpenAgent)
      return (
        <div key={it.key} className={ENTER}>
          <AgentCard run={run} cwd={cwd} onOpen={onOpenAgent} />
        </div>
      )
    if (it.kind === 'block' && isFileEdit(it.block))
      return (
        <div key={it.key} className={ENTER}>
          <FileEditBadge block={it.block} cwd={cwd} />
        </div>
      )
    return it.kind === 'group' ? (
      <div key={it.key} className={ENTER}>
        <ToolGroup blocks={it.blocks} cwd={cwd} shown={it.shown} />
      </div>
    ) : (
      <div key={it.key} className={ENTER}>
        <BlockView block={it.block} live={live && it.block === lastBlock} collapsed={collapsed} />
      </div>
    )
  }
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

/** How long the turn has run, ticking each second; null when it is not known. */
function useElapsed(since: number | null): string | null {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (since === null) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [since])
  return since === null ? null : formatDuration(Math.max(0, now - since))
}

const SHIMMER =
  'animate-[shimmer_2.2s_linear_infinite] bg-[linear-gradient(90deg,var(--faint)_0%,var(--faint)_40%,var(--foreground)_50%,var(--faint)_60%,var(--faint)_100%)] bg-[length:300%_100%] bg-clip-text text-transparent'

/** Under the last exchange while Claude works: what it does now, for how long, how to stop. */
function LiveLine({ cwd, state, watch }: { cwd: string; state: ChatState; watch: boolean }) {
  const { target, verb } = liveStep(state, cwd)
  const elapsed = useElapsed(state.startedAt)
  const loaders = useLoaderChoice()
  const stoppable = !watch && state.status === 'working' && !state.stopping
  const line = (
    <div className="flex h-7 min-w-0 items-center gap-2.5 text-base">
      <BrailleSpinner
        loader={verb === 'Thinking' ? loaders.thinking : loaders.working}
        className="text-faint text-[15px]"
      />
      <span className={cn('flex min-w-0 items-baseline gap-1.5', SHIMMER)}>
        <span className="flex-none">{target === '' ? `${verb}…` : verb}</span>
        {target !== '' && <span className="truncate font-mono text-[12.5px]">{target}</span>}
      </span>
      {elapsed !== null && (
        <span className="text-label flex-none text-xs tabular-nums">{elapsed}</span>
      )}
      {stoppable && (
        <span className="text-label flex-none text-xs">
          <Kbd className="text-label">esc</Kbd> to stop
        </span>
      )}
    </div>
  )
  if (!state.compacting) return line
  // No progress is reported, only that it runs: an indeterminate bar, under the line.
  return (
    <div className="flex flex-col gap-1.5">
      {line}
      <div
        role="progressbar"
        aria-label="Compacting the conversation"
        className="bg-chrome ml-[26px] h-1 w-48 overflow-hidden rounded-full"
      >
        <div className="bg-foreground/60 h-full w-2/5 animate-[sweep_1.4s_ease-in-out_infinite] rounded-full motion-reduce:animate-none" />
      </div>
    </div>
  )
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
  /** A sub-agent's chat, watched: nothing here can be stopped. */
  watch?: boolean
  /** A sub-agent's card: its own chat. Without it, agent calls show as plain tool rows. */
  onOpenAgent?: (id: string) => void
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

/**
 * The chat's scrolling column: the exchanges, what is running, the last error. Memoized: a
 * long chat must not redraw on every key typed in the composer.
 */
export const Transcript = memo(function Transcript({
  blocked,
  cwd,
  intro,
  onOpenAgent,
  onOpenFile,
  place,
  state,
  watch = false,
}: Props) {
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
  const sent = state.turns.filter((t) => t.role === 'user').length
  useLayoutEffect(() => {
    pinned.current = true
    setFollowing(true)
  }, [sent])

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
  const all = exchanges(state.turns, working, new Set(state.pending.map((p) => p.toolUseId)))
  const { first, sentinel } = useWindow(scroller, all.length)

  const toLatest = () => {
    const el = scroller.current
    if (!el) return
    pinned.current = true
    setFollowing(true)
    el.scrollTo({ behavior: smooth(), top: el.scrollHeight })
  }

  return (
    <div className="@container relative flex min-h-0 flex-1 flex-col">
      {/* Everything in the chat reads as text (I-beam, selectable); its buttons keep the hand. */}
      <div
        className="min-h-0 flex-1 cursor-text overflow-auto select-text"
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
          {first > 0 && <div ref={sentinel} className="h-px flex-none" aria-hidden />}
          {all.slice(first).map((exchange) => (
            // Off screen, an exchange is neither laid out nor painted: a long chat scrolls
            // as lightly as a short one. Its last measured height holds its place.
            <div
              key={exchange.key}
              className="flex flex-col gap-6 [contain-intrinsic-size:auto_480px] [content-visibility:auto]"
            >
              <ExchangeView
                exchange={exchange}
                cwd={cwd}
                agentOf={(id) => agentRun(state, id)}
                onOpenAgent={onOpenAgent}
                onOpenFile={onOpenFile}
              />
            </div>
          ))}
          {((working && !streamingText && permission === undefined) || state.stopping) && (
            <LiveLine cwd={cwd} state={state} watch={watch} />
          )}
          {state.errors.length > 0 && (
            <div className="bg-critical-wash text-critical-ink rounded-lg px-3 py-2.5 text-sm leading-5 whitespace-pre-wrap">
              {state.errors.at(-1)}
            </div>
          )}
        </div>
      </div>
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
})
