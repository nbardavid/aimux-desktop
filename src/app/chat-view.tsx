import { openUrl } from '@tauri-apps/plugin-opener'
import { type KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from 'react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { type Block, type ChatState, type Permission, toolSummary } from '../chat/model'
import { Icon } from './icons'

interface Props {
  cwd: string
  state: ChatState
  onSend: (text: string) => void
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

export function ChatView({ cwd, onAnswer, onInterrupt, onSend, state }: Props) {
  const [draft, setDraft] = useState('')
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

  const submit = () => {
    const text = draft.trim()
    if (text === '' || state.status === 'exited') return
    pinned.current = true
    onSend(text)
    setDraft('')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
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
              <div key={turn.id} className="msg-user">
                {turn.blocks.map((b) => (b.kind === 'text' ? b.text : '')).join('')}
              </div>
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
            onChange={(e) => setDraft(e.target.value)}
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
                onClick={submit}
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
