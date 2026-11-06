import { ArrowUpIcon, SquareIcon } from 'lucide-react'
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

import { isAppCommand, parseCommand, rankCommands } from '../chat/commands'
import { type ChatState, type Permission, type SlashCommand, toolSummary } from '../chat/model'
import {
  agentCommand,
  agentLabel,
  type ChatSettings,
  cycleEffort,
  type ModelInfo,
} from '../model/agents'
import { ModelSelect } from './agent-select'
import { CommandHint, CommandMenu } from './command-menu'
import { overlayShown } from './overlay'
import { QueuedTurn, Transcript } from './transcript'

interface Props {
  /** The chat's id: a new one is a chat navigated to, whose composer takes the focus. */
  id: string
  cwd: string
  state: ChatState
  /** This chat's model and effort, as its record keeps them. */
  agent: ChatSettings
  models: ModelInfo[]
  /** A model or effort picked in the footer or by ⇧⌘/, or `typed` as `/model`, `/effort`. */
  onAgent: (next: ChatSettings, typed: boolean) => void
  /** An old background host holds the chats: the transcript shows, nothing runs. */
  blocked: boolean
  /** What the `/` menu offers: the app's commands and this chat's Claude's. */
  commands: SlashCommand[]
  onSend: (text: string) => void
  /** One of the app's own commands (`/resume`, `/clear`…), typed or picked. */
  onCommand: (name: string, args: string) => void
  onAnswer: (permission: Permission, choice: 'allow' | 'always' | 'deny') => void
  onInterrupt: () => void
  /** Under the empty chat's question, in place of how the chat works. */
  intro?: ReactNode
  /** The workspace's name, for the empty chat's question (a renamed one is not its folder). */
  place?: string
  /** Toasts, floated at the pane's right just above the question and the composer. */
  above?: ReactNode
  /** A turn footer's file chip: git mode on that file (relative path), or on all (`null`). */
  onOpenFile?: (path: string | null) => void
}

/** A key cap on the ink button. */
const KBD_INK = 'text-white/60'
// The card dims as a whole while the turn stops: its buttons don't dim a second time.
const ANSWER = 'disabled:opacity-100'

function PermissionCard({
  cwd,
  disabled,
  onAnswer,
  permission,
}: {
  cwd: string
  permission: Permission
  onAnswer: Props['onAnswer']
  /** The turn is being stopped: the question goes with it. */
  disabled: boolean
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-lg border border-line-strong bg-background px-3.5 py-3 transition-opacity duration-160',
        'animate-in fade-in slide-in-from-bottom-[6px] duration-200 ease-out',
        disabled && 'opacity-60'
      )}
      aria-disabled={disabled || undefined}
      role="alertdialog"
      aria-label={`Allow ${permission.toolName}?`}
    >
      <div className="text-base">
        Allow <b className="font-semibold">{permission.toolName}</b>?
      </div>
      <code className="max-h-[120px] overflow-auto rounded-md bg-chrome px-2.5 py-2 font-mono text-[12.5px] leading-5 whitespace-pre-wrap wrap-anywhere text-ink-soft">
        {toolSummary(permission.toolName, permission.input, cwd) || permission.description}
      </code>
      {/* No button takes the focus: a key meant for the composer never answers. */}
      <div className="flex justify-end gap-1.5">
        <Button
          variant="secondary"
          size="sm"
          className={ANSWER}
          aria-keyshortcuts="Meta+Backspace"
          disabled={disabled}
          onClick={() => onAnswer(permission, 'deny')}
        >
          Deny
          <Kbd>⌘⌫</Kbd>
        </Button>
        {permission.suggestions.length > 0 && (
          <Button
            variant="secondary"
            size="sm"
            className={ANSWER}
            aria-keyshortcuts="Shift+Meta+Enter"
            disabled={disabled}
            onClick={() => onAnswer(permission, 'always')}
          >
            Always allow
            <Kbd>⇧⌘↩</Kbd>
          </Button>
        )}
        <Button
          size="sm"
          className={ANSWER}
          aria-keyshortcuts="Meta+Enter"
          disabled={disabled}
          onClick={() => onAnswer(permission, 'allow')}
        >
          Allow
          <Kbd className={KBD_INK}>⌘↩</Kbd>
        </Button>
      </div>
    </div>
  )
}

// The ink square that sends (or stops): no hover change, grey and opaque when disabled.
const SEND = 'rounded-md hover:bg-primary disabled:bg-line-strong disabled:opacity-100'

function stepOf(e: KeyboardEvent): number {
  if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) return 1
  if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) return -1
  return 0
}

export function ChatView({
  above,
  agent,
  blocked,
  commands,
  cwd,
  id,
  intro,
  models,
  onAgent,
  onAnswer,
  onCommand,
  onInterrupt,
  onOpenFile,
  onSend,
  place,
  state,
}: Props) {
  const [draft, setDraft] = useState('')
  // The `/` menu: its highlighted row, and the draft Esc closed it on (it stays shut until
  // the draft changes).
  const [hot, setHot] = useState(0)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const menuId = useId()
  const [agentOpen, setAgentOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLTextAreaElement>(null)
  const working = state.status === 'working' || state.status === 'starting'
  const permission = state.pending[0]
  // Nothing can be typed: Claude has stopped, or an old host holds the chat.
  const off = blocked || state.status === 'exited'

  // A chat navigated to takes the keys, question pending or not; a question arriving in the
  // chat you look at leaves the focus where it is, and its answer gives it back.
  useEffect(() => {
    field.current?.focus()
  }, [id])
  useEffect(() => {
    if (permission === undefined) field.current?.focus()
  }, [permission])

  // Keys that work anywhere in the chat, not only in the composer: answering a permission
  // (⌘↩ Allow, ⇧⌘↩ Always allow, ⌘⌫ Deny), ⇧⌘/ for the effort, Esc to stop, and ⌘L, from
  // anywhere in the window, to type here (a terminal lets it through: appShortcut).
  // While the turn is being stopped, its question can no longer be answered.
  const answerable = state.stopping ? undefined : permission
  const keys = useRef({
    agent,
    answerable,
    models,
    onAgent,
    onAnswer,
    onInterrupt,
    working,
  })
  keys.current = {
    agent,
    answerable,
    models,
    onAgent,
    onAnswer,
    onInterrupt,
    working,
  }
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const k = keys.current
      // Handled already (the `/` menu's Esc), or meant for a dialog or menu over the chat.
      if (e.defaultPrevented || overlayShown()) return
      const p = k.answerable
      if (p && e.metaKey && e.key === 'Enter') {
        if (!e.shiftKey) k.onAnswer(p, 'allow')
        else if (p.suggestions.length > 0) k.onAnswer(p, 'always')
      } else if (p && e.metaKey && e.key === 'Backspace') k.onAnswer(p, 'deny')
      else if (e.metaKey && e.shiftKey && (e.key === '/' || e.code === 'Slash')) {
        k.onAgent(cycleEffort(k.agent, k.models), false)
      } else if (e.metaKey && !e.shiftKey && !e.altKey && !e.ctrlKey && e.code === 'KeyL') {
        field.current?.focus()
      } else if (
        e.key === 'Escape' &&
        k.working &&
        (e.target === document.body || root.current?.contains(e.target as Node) === true)
      ) {
        k.onInterrupt()
      } else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useLayoutEffect(() => {
    const el = field.current
    if (!el) return
    el.style.height = 'auto'
    // Grows to 40% of the window, then scrolls.
    el.style.height = `${Math.min(el.scrollHeight, window.innerHeight * 0.4)}px`
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
    if (text === '' || off) return
    const command = parseCommand(text)
    if (command?.name === 'model' || command?.name === 'effort') {
      // A name it knows applies at once; anything else opens the picker.
      const next = agentCommand(command.name, command.args, agent, models)
      if (next) onAgent(next, true)
      else setAgentOpen(true)
    } else if (command && isAppCommand(command.name)) onCommand(command.name, command.args)
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
    // With a permission pending, ⌘↩ answers it (the window's listener), it never sends.
    const answering = e.metaKey && permission !== undefined
    if (answering) return
    if (menu.length > 0 && onMenuKey(e)) return
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  let placeholder = 'Ask Claude, or type / for a command'
  if (blocked) placeholder = 'Read-only until the background process restarts'
  else if (state.status === 'exited') placeholder = 'Claude has stopped'

  return (
    <div className="flex min-h-0 flex-1 flex-col" ref={root}>
      <Transcript
        cwd={cwd}
        place={place}
        state={state}
        blocked={blocked}
        intro={intro}
        onOpenFile={onOpenFile}
      />
      {/* Toasts float at the pane's right, above the question and the composer. */}
      <div className="relative flex-none">
        {above}
        {/* The column's 720px and 16px either side: 752px of composer. */}
        <div className="relative mx-auto flex w-full max-w-[784px] flex-col gap-2 px-4 pb-4">
          {permission !== undefined && (
            <PermissionCard
              cwd={cwd}
              permission={permission}
              disabled={state.stopping}
              onAnswer={onAnswer}
            />
          )}
          {state.queued.map((turn) => (
            <QueuedTurn key={turn.id} turn={turn} />
          ))}
          {/* The `/` menu floats over the composer: the composer itself never moves. */}
          <div
            data-composer
            className={cn(
              'shadow-composer focus-within:border-line-strong relative flex flex-col rounded-lg border transition-[border-color,background-color] duration-120 ease-out',
              off ? 'bg-background' : 'bg-chrome'
            )}
          >
            {menu.length > 0 && (
              <CommandMenu
                id={menuId}
                items={menu}
                query={typing?.[1] ?? ''}
                hot={at}
                onHover={setHot}
                onPick={accept}
              />
            )}
            {hint && <CommandHint command={hint} />}
            <Textarea
              ref={field}
              // Three lines' worth empty: the box is 116px with its toolbar.
              className="peer min-h-[74px] rounded-none border-0 bg-transparent px-4 pt-3.5 pb-1 text-base field-sizing-fixed placeholder:text-label focus-visible:ring-0 disabled:opacity-100"
              rows={1}
              value={draft}
              placeholder={placeholder}
              disabled={off}
              role="combobox"
              aria-expanded={menu.length > 0}
              aria-controls={menuId}
              aria-autocomplete="list"
              aria-activedescendant={menu.length > 0 ? `${menuId}-${at}` : undefined}
              onChange={(e) => edit(e.target.value)}
              onKeyDown={onKeyDown}
            />
            {!off && draft === '' && (
              <span className="text-faint pointer-events-none absolute top-3.5 right-4 text-xs leading-[22px] transition-opacity duration-120 ease-out select-none peer-focus:opacity-0">
                ⌘L to focus
              </span>
            )}
            <div className="flex h-10 flex-none items-end gap-1 px-2 pb-2">
              {state.status === 'exited' ? (
                <span className="text-faint flex h-7 items-center pl-2">
                  {agentLabel(agent, models)}
                </span>
              ) : (
                <ModelSelect
                  value={agent}
                  models={models}
                  className="text-muted-foreground hover:bg-hover data-popup-open:bg-hover h-7 gap-1 rounded-md pr-1.5 pl-2 font-normal [&>svg:last-child]:size-3"
                  open={agentOpen}
                  onOpenChange={setAgentOpen}
                  finalFocus={field}
                  onChange={(next) => onAgent(next, false)}
                />
              )}
              <span className="min-w-0 flex-1" />
              {working ? (
                <Button
                  size="icon"
                  className={SEND}
                  aria-label={state.stopping ? 'Stopping' : 'Stop (Esc)'}
                  data-tip={state.stopping ? 'Stopping…' : 'Stop · Esc'}
                  data-tip-side="top"
                  disabled={state.stopping}
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
                  disabled={off || draft.trim() === ''}
                  onClick={() => submit()}
                >
                  <ArrowUpIcon className="size-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
