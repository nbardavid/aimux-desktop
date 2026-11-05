import { openUrl } from '@tauri-apps/plugin-opener'
import { type KeyboardEvent, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { isAppCommand, parseCommand, rankCommands } from '../chat/commands'
import {
  type Block,
  type ChatState,
  type Permission,
  type SlashCommand,
  toolSummary,
} from '../chat/model'
import { CommandHint, CommandMenu } from './command-menu'
import { Icon } from './icons'

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
  img: ({ alt }) => <span className="faint">[{alt ?? 'image'}]</span>,
}

const PLUGINS = [remarkGfm]

// A command's output past this many lines folds, with "Show all".
const OUTPUT_LINES = 12

function OutputCard({ text }: { text: string }) {
  const long = text.split('\n').length > OUTPUT_LINES
  const [open, setOpen] = useState(false)
  return (
    <div className={long && !open ? 'cmd-out is-folded' : 'cmd-out'}>
      <div className="md">
        <Markdown remarkPlugins={PLUGINS} components={MD}>
          {text}
        </Markdown>
      </div>
      {long && (
        <button type="button" className="cmd-out-more" onClick={() => setOpen((o) => !o)}>
          {open ? 'Show less' : 'Show all'}
        </button>
      )}
    </div>
  )
}

function ToolBody({ block }: { block: Block & { kind: 'tool' } }) {
  const { input, name, result } = block
  if (
    name === 'Edit' &&
    typeof input.old_string === 'string' &&
    typeof input.new_string === 'string'
  ) {
    return (
      <pre className="tool-out">
        {input.old_string.split('\n').map((line, i) => (
          // oxlint-disable-next-line react/no-array-index-key -- lines are positional
          <div key={`d${i}`} className="dl-del">
            − {line}
          </div>
        ))}
        {input.new_string.split('\n').map((line, i) => (
          // oxlint-disable-next-line react/no-array-index-key -- lines are positional
          <div key={`a${i}`} className="dl-add">
            + {line}
          </div>
        ))}
      </pre>
    )
  }
  const command = typeof input.command === 'string' ? input.command : ''
  const shown = name === 'Bash' ? `$ ${command}` : JSON.stringify(input, null, 2)
  return (
    <pre className="tool-out">
      {shown}
      {result !== undefined && result.text !== '' && `\n\n${result.text}`}
    </pre>
  )
}

function BlockView({ block, cwd, live }: { block: Block; cwd: string; live: boolean }) {
  if (block.kind === 'text') {
    return (
      <div className={live ? 'md is-live' : 'md'}>
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
      <details className="thinking">
        <summary>Thought</summary>
        <div className="thinking-text">{block.text}</div>
      </details>
    )
  }
  let dot = 'st-working'
  if (block.result) dot = block.result.isError ? 'st-failing' : 'st-done'
  return (
    <details className="tool">
      <summary>
        <span className={`st ${dot}`} />
        <span className="tool-name">{block.name}</span>
        <span className="tool-sum">{toolSummary(block.name, block.input, cwd)}</span>
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
    <div className="perm" role="alertdialog" aria-label={`Allow ${permission.toolName}?`}>
      <div className="perm-head">
        Allow <b>{permission.toolName}</b>?
      </div>
      <code className="perm-what">
        {toolSummary(permission.toolName, permission.input, cwd) || permission.description}
      </code>
      <div className="perm-actions">
        <button type="button" className="btn btn-soft" onClick={() => onAnswer(permission, 'deny')}>
          Deny
        </button>
        {permission.suggestions.length > 0 && (
          <button
            type="button"
            className="btn btn-soft"
            onClick={() => onAnswer(permission, 'always')}
          >
            Always allow
          </button>
        )}
        {/* oxlint-disable-next-line jsx-a11y/no-autofocus -- the decision is the only thing to do */}
        <button
          type="button"
          className="btn btn-ink"
          autoFocus
          onClick={() => onAnswer(permission, 'allow')}
        >
          Allow
        </button>
      </div>
    </div>
  )
}

function UserTurn({ blocks }: { blocks: Block[] }) {
  const first = blocks[0]
  if (first?.kind === 'command') {
    return (
      <div className="msg-user is-command">
        <span className="cmd-chip-name">/{first.name}</span>
        {first.args !== '' && ` ${first.args}`}
      </div>
    )
  }
  return (
    <div className="msg-user">{blocks.map((b) => (b.kind === 'text' ? b.text : '')).join('')}</div>
  )
}

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
    <div className="chat">
      <div
        className="chat-scroll"
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
        }}
      >
        <div className="chat-col">
          {state.turns.length === 0 && (
            <div className="chat-empty">
              <Icon name="chat" />
              <span className="chat-empty-title">What are we doing in {name}?</span>
              <span className="faint">
                Claude Code, in this workspace’s folder. Enter sends, Esc stops.
              </span>
            </div>
          )}
          {state.turns.map((turn) =>
            turn.role === 'user' ? (
              <UserTurn key={turn.id} blocks={turn.blocks} />
            ) : (
              <div key={turn.id} className="msg-assistant">
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
            <div className="chat-working">
              <span className="st st-working" />
              {state.status === 'starting' ? 'Starting Claude…' : 'Working…'}
            </div>
          )}
          {state.lastTurn && !working && (
            <div className="chat-meta">
              {(state.lastTurn.durationMs / 1000).toFixed(1)}s · $
              {state.lastTurn.costUsd.toFixed(3)}
            </div>
          )}
          {state.errors.length > 0 && <div className="chat-error">{state.errors.at(-1)}</div>}
        </div>
      </div>
      <div className="chat-foot">
        {permission !== undefined && (
          <PermissionCard cwd={cwd} permission={permission} onAnswer={onAnswer} />
        )}
        <div className="composer">
          {menu.length > 0 && (
            <CommandMenu id={menuId} items={menu} hot={at} onHover={setHot} onPick={accept} />
          )}
          {hint && <CommandHint command={hint} />}
          <textarea
            ref={field}
            className="composer-field"
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
          <div className="composer-bar">
            <span className="faint">{state.model ?? 'claude'}</span>
            <span className="grow" />
            {working ? (
              <button
                type="button"
                className="send is-stop"
                aria-label="Stop (Esc)"
                data-tip="Stop · Esc"
                data-tip-side="top"
                onClick={onInterrupt}
              >
                <Icon name="stop" small />
              </button>
            ) : (
              <button
                type="button"
                className="send"
                aria-label="Send (Enter)"
                data-tip="Send · Enter"
                data-tip-side="top"
                disabled={draft.trim() === ''}
                onClick={() => submit()}
              >
                <Icon name="arrowUp" small />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
