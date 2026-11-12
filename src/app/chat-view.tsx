import { ArrowUpIcon, SquareIcon } from 'lucide-react'
import {
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
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

import { commandTokens, isAppCommand, parseCommand, rankCommands, slashAt } from '../chat/commands'
import {
  agentRun,
  type ChatState,
  type Image,
  type Permission,
  questionsOf,
  runningAgents,
  type SlashCommand,
  toolSummary,
  type Turn,
} from '../chat/model'
import { imagesOf, recallStep, sentPrompts, typedText } from '../chat/recall'
import {
  agentCommand,
  agentLabel,
  type ChatSettings,
  cycleEffort,
  type ModelInfo,
} from '../model/agents'
import { ModelSelect } from './agent-select'
import { AgentBar, RunningAgents } from './agents'
import { CommandHint, CommandMenu } from './command-menu'
import { ContextMeter } from './context-meter'
import { ImageStrip } from './image-strip'
import { overlayShown } from './overlay'
import { clipboardImages, readImage } from './pasted-images'
import { PixelWipe } from './pixel-wipe'
import { QuestionCard } from './question-card'
import { QueuedPrompts, Transcript } from './transcript'

/** What the marks behind the prompt copy from it, to wrap its text at the same places. */
const MIRRORED = [
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'letter-spacing',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'border-top-width',
  'border-left-width',
  'border-style',
  'border-color',
  'tab-size',
] as const

/** The prompt cut at the commands it names, those wrapped in a mark. */
const segments = (text: string, named: { end: number; start: number }[]) => {
  const out: ReactNode[] = []
  let at = 0
  for (const { end, start } of named) {
    out.push(text.slice(at, start))
    out.push(
      <mark
        key={start}
        className="bg-command rounded-[3px] text-transparent shadow-[0_0_0_2px_var(--command)]"
      >
        {text.slice(start, end)}
      </mark>
    )
    at = end
  }
  out.push(`${text.slice(at)}\n`)
  return out
}

/** The prompt's look, shared with the twin that measures it. */
/** The field as a shell prompt, past its `$`: same type as a prompt. */
const SHELL_FIELD = 'pl-9 caret-tan'

const COMPOSER_FIELD =
  'min-h-0 rounded-none border-0 bg-transparent px-4 pt-2.5 pb-0 text-base field-sizing-fixed placeholder:text-label focus-visible:ring-0 disabled:opacity-100'

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
  /** A prompt, with the images pasted into it (`text` is empty for images alone). */
  onSend: (text: string, images: Image[]) => void
  /** One of the app's own commands (`/resume`, `/clear`…), typed or picked. */
  onCommand: (name: string, args: string) => void
  /** `answers`: AskUserQuestion's picks, keyed by question. */
  onAnswer: (
    permission: Permission,
    choice: 'allow' | 'always' | 'deny',
    answers?: Record<string, string>
  ) => void
  onInterrupt: () => void
  /** A `!` command, run in the worktree (Claude Code's bash mode); absent, `!` is plain text. */
  onShell?: (command: string) => void
  /** Takes back queued prompts (by id): true for each Claude let go of before starting it. */
  onUnqueue?: (ids: string[]) => Promise<boolean[]>
  /** Asks Claude Code for its breakdown of the context (the meter's popover, on open). */
  onAskUsage?: () => void
  /** Stops a sub-agent (or a background shell), by its task id. */
  onStopTask?: (taskId: string) => void
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

const DRAFTS = 'logit.chat.drafts'

/** Unsent prompts saved by an earlier launch, by chat: their text only. */
function savedTexts(): Record<string, string> {
  try {
    const all: unknown = JSON.parse(localStorage.getItem(DRAFTS) ?? '{}')
    return typeof all === 'object' && all !== null ? (all as Record<string, string>) : {}
  } catch {
    return {}
  }
}

/**
 * Each tab's unsent prompt and images: switching tabs or workspaces never loses them, and the
 * text survives quitting too (images stay in memory: too big to keep).
 */
const drafts = new Map<string, { text: string; images: Image[] }>(
  Object.entries(savedTexts()).map(([id, text]) => [id, { images: [], text }])
)

function keepDraft(id: string, text: string, images: Image[]) {
  drafts.set(id, { images, text })
  const all = savedTexts()
  if (text === '') delete all[id]
  else all[id] = text
  try {
    localStorage.setItem(DRAFTS, JSON.stringify(all))
  } catch {
    // Only a convenience: the text then lives until the window closes.
  }
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
  onAskUsage,
  onCommand,
  onInterrupt,
  onOpenFile,
  onSend,
  onShell,
  onStopTask,
  onUnqueue,
  place,
  state,
}: Props) {
  const [draft, setDraft] = useState(() => drafts.get(id)?.text ?? '')
  const [caret, setCaret] = useState(() => draft.length)
  // Pasted images, shown over the prompt until it is sent.
  const [images, setImages] = useState<Image[]>(() => drafts.get(id)?.images ?? [])
  // Another tab: its own unsent prompt comes back (set while rendering, so never shown wrong).
  const [draftOf, setDraftOf] = useState(id)
  if (draftOf !== id) {
    setDraftOf(id)
    setDraft(drafts.get(id)?.text ?? '')
    setCaret((drafts.get(id)?.text ?? '').length)
    setImages(drafts.get(id)?.images ?? [])
  }
  useEffect(() => {
    keepDraft(id, draft, images)
  }, [id, draft, images])
  // A `!` first makes the prompt a shell command (Claude Code's bash mode). The draft keeps
  // the `!`; the field shows what follows it, behind a `$`.
  const shellMode = onShell !== undefined && draft.startsWith('!')
  const lead = shellMode ? 1 : 0
  const shown = draft.slice(lead)
  // The `/` menu: its highlighted row, and the draft Esc closed it on (it stays shut until
  // the draft changes).
  const [hot, setHot] = useState(0)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const menuId = useId()
  const [agentOpen, setAgentOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLTextAreaElement>(null)
  // A hidden twin of the prompt, measured instead of it: collapsing the prompt itself to
  // measure it let the chat above jump and lose its last line on every key.
  const twin = useRef<HTMLTextAreaElement>(null)
  // The commands the prompt names, marked behind its text: drawn in a copy laid out like it.
  const marks = useRef<HTMLDivElement>(null)
  // A stable handler, so typing (which redraws this view) leaves the transcript alone.
  const latestOpen = useRef(onOpenFile)
  latestOpen.current = onOpenFile
  const openFile = useCallback((path: string | null) => latestOpen.current?.(path), [])
  // A sub-agent's chat open in place of the conversation (its call's id), per chat.
  const [viewing, setViewing] = useState<{ chat: string; agent: string } | null>(null)
  const run = viewing?.chat === id ? agentRun(state, viewing.agent) : null
  const openAgent = useCallback((agent: string) => setViewing({ agent, chat: id }), [id])
  const back = useCallback(() => {
    setViewing(null)
    field.current?.focus()
  }, [])
  const inAgent = run !== null
  useEffect(() => {
    if (!inAgent) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      back()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [inAgent, back])
  const working = state.status === 'working' || state.status === 'starting'
  const permission = state.pending[0]
  const questions = permission ? questionsOf(permission) : null
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
  // A question answers with its picks, from its own card's keys: ⌘↩ never allows it blank.
  const answerable = state.stopping || questions ? undefined : permission
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
    const measure = twin.current
    if (!el || !measure) return
    measure.style.width = `${el.clientWidth}px`
    measure.value = shown || ' '
    // Grows to 40% of the window, then scrolls.
    const height = `${Math.min(measure.scrollHeight, window.innerHeight * 0.4)}px`
    if (el.style.height !== height) el.style.height = height
    const copy = marks.current
    if (copy) {
      const look = getComputedStyle(el)
      for (const key of MIRRORED) copy.style.setProperty(key, look.getPropertyValue(key))
      copy.style.top = `${el.offsetTop}px`
      copy.style.width = `${el.clientWidth}px`
      copy.style.height = height
      copy.scrollTop = el.scrollTop
    }
  }, [draft, shown])
  const named = shellMode ? [] : commandTokens(draft, commands)

  // The `/word` at the caret, wherever it stands; mid-sentence, the app's own commands (which
  // only run alone) are left out.
  const slot = slashAt(draft, caret)
  const alone = slot !== null && slot.start === 0 && draft === `/${slot.query}`
  const offered =
    slot === null || slot.start === 0 ? commands : commands.filter((c) => !isAppCommand(c.name))
  const menu =
    slot && !shellMode && draft !== dismissed && state.status !== 'exited'
      ? rankCommands(offered, slot.query)
      : []
  // The commands can change under an open menu (the chat's own list arrives).
  const at = Math.min(hot, Math.max(menu.length - 1, 0))
  const chosen = parseCommand(draft)
  const hint =
    menu.length === 0 && chosen && /\s/.test(draft) && !draft.includes('\n')
      ? commands.find((c) => c.name === chosen.name && c.argumentHint !== '')
      : undefined

  const edit = (text: string, at = text.length) => {
    setDraft(text)
    setCaret(at)
    setHot(0)
  }

  /** The `/word` at the caret becomes the command, followed by a space, the caret after it. */
  const insert = (command: SlashCommand) => {
    if (slot === null) return
    const end = slot.start + 1 + slot.query.length
    const rest = draft.slice(end).replace(/^\s/, '')
    const head = `${draft.slice(0, slot.start)}/${command.name} `
    edit(head + rest, head.length)
    requestAnimationFrame(() => field.current?.setSelectionRange(head.length, head.length))
  }

  // ↑ and ↓ through the prompts already sent, as in a shell: where in it the prompt is.
  const sent = sentPrompts(state.turns)
  const [recalled, setRecalled] = useState<number | null>(null)
  // Typing over a recalled prompt makes it a new one.
  const recall = recalled !== null && sent[recalled] === draft ? recalled : null

  /**
   * Queued prompts back into the composer, to edit or drop: Claude lets go of those it hasn't
   * started (one it already took stays and runs).
   */
  const takeBack = async (turns: readonly Turn[], into: boolean) => {
    if (!onUnqueue || turns.length === 0) return
    const kept = await onUnqueue(turns.map((t) => t.id))
    const back = turns.filter((_, i) => kept[i] === true)
    if (!into || back.length === 0) return
    const text = back.map(typedText).filter((t) => t !== '')
    const words = [...text, draft].filter((t) => t !== '').join('\n\n')
    edit(words)
    setImages((prev) => [...back.flatMap(imagesOf), ...prev])
    requestAnimationFrame(() => field.current?.focus())
  }

  const onArrow = (e: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    const step = { ArrowDown: 1, ArrowUp: -1 }[e.key] ?? 0
    if (step === 0 || e.shiftKey || e.altKey || e.metaKey || e.ctrlKey) return false
    const box = e.currentTarget
    if (box.selectionStart !== box.selectionEnd) return false
    // Only from the first line up, the last line down: inside a long prompt, arrows move.
    const before = shown.slice(0, box.selectionStart)
    const after = shown.slice(box.selectionEnd)
    if (step < 0 ? before.includes('\n') : after.includes('\n')) return false
    if (step < 0 && draft === '' && state.queued.length > 0) {
      void takeBack(state.queued, true)
    } else {
      if (draft !== '' && recall === null) return false
      const next = recallStep(sent.length, recall, step)
      if (next === recall) return false
      setRecalled(next)
      edit(next === null ? '' : (sent[next] ?? ''))
    }
    e.preventDefault()
    return true
  }

  const submit = (line = draft) => {
    const text = line.trim()
    if ((text === '' && images.length === 0) || off) return
    // `!` runs the rest in the worktree; the images wait for the next prompt.
    if (onShell && text.startsWith('!')) {
      const command = text.slice(1).trim()
      if (command === '') return
      onShell(command)
      edit('')
      return
    }
    // A command runs on its own: the images wait for the next prompt.
    const command = parseCommand(text)
    if (command?.name === 'model' || command?.name === 'effort') {
      // A name it knows applies at once; anything else opens the picker.
      const next = agentCommand(command.name, command.args, agent, models)
      if (next) onAgent(next, true)
      else setAgentOpen(true)
    } else if (command && isAppCommand(command.name)) onCommand(command.name, command.args)
    else {
      onSend(text, images)
      setImages([])
    }
    edit('')
  }

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = clipboardImages(e.clipboardData)
    if (files.length === 0) return
    e.preventDefault()
    void Promise.allSettled(files.map(readImage)).then((read) => {
      const ok = read.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
      setImages((prev) => [...prev, ...ok])
    })
  }

  /** A command with arguments waits for them; one without runs. */
  const accept = (command: SlashCommand) => {
    if (alone && command.argumentHint === '') submit(`/${command.name}`)
    else insert(command)
  }

  const onMenuKey = (e: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    const step = stepOf(e)
    const command = menu[at]
    if (step !== 0) setHot((at + step + menu.length) % menu.length)
    else if (e.key === 'Escape') setDismissed(draft)
    else if (command && e.key === 'Tab') insert(command)
    else if (command && e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      // A name typed in full runs as typed; a partial one is completed first.
      if (alone && command.name === slot?.query) submit()
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
    // ⌫ at the very start, or Esc on an empty command, leaves the shell (the text stays).
    const box = e.currentTarget
    const atStart = box.selectionStart === 0 && box.selectionEnd === 0
    if (shellMode && ((e.key === 'Backspace' && atStart) || (e.key === 'Escape' && shown === ''))) {
      e.preventDefault()
      e.stopPropagation()
      edit(shown, 0)
      return
    }
    // ⌫ in an empty prompt takes back the last image pasted.
    if (e.key === 'Backspace' && draft === '' && images.length > 0) {
      e.preventDefault()
      setImages(images.slice(0, -1))
      return
    }
    if (onArrow(e)) return
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  let placeholder = 'Ask Claude, / for a command, ! for the shell'
  if (onShell === undefined) placeholder = 'Ask Claude, or type / for a command'
  if (blocked) placeholder = 'Read-only until the background process restarts'
  else if (state.status === 'exited') placeholder = 'Claude has stopped'
  else if (shellMode) placeholder = 'Enter a command'

  return (
    <div className="flex min-h-0 flex-1 flex-col" ref={root}>
      {run ? (
        <>
          <AgentBar run={run} place={place ?? 'Chat'} onBack={back} onStop={onStopTask} />
          <Transcript key={run.call.id} cwd={cwd} state={run.chat} blocked={false} watch />
          <div className="text-label mx-auto w-full max-w-[752px] flex-none border-t border-dashed px-4 py-3 text-center text-xs">
            Read only: a sub-agent takes no messages
          </div>
        </>
      ) : (
        <Transcript
          // Each chat opens on its own last page.
          key={id}
          cwd={cwd}
          place={place}
          state={state}
          blocked={blocked}
          intro={intro}
          onOpenAgent={openAgent}
          onOpenFile={openFile}
        />
      )}
      {/* Toasts float at the pane's right, above the question and the composer. */}
      <div className={cn('relative flex-none', run && 'hidden')}>
        {above}
        {/* The column's 720px and 16px either side: 752px of composer. */}
        <div className="relative mx-auto flex w-full max-w-[784px] flex-col gap-2 px-4 pb-4">
          <RunningAgents runs={runningAgents(state)} onOpen={openAgent} onStop={onStopTask} />
          {permission !== undefined && questions !== null && (
            <QuestionCard
              key={permission.requestId}
              permission={permission}
              questions={questions}
              disabled={state.stopping}
              onAnswer={(choice, answers) => onAnswer(permission, choice, answers)}
            />
          )}
          {permission !== undefined && questions === null && (
            <PermissionCard
              cwd={cwd}
              permission={permission}
              disabled={state.stopping}
              onAnswer={onAnswer}
            />
          )}
          {/* The `/` menu floats over the composer: the composer itself never moves. */}
          <div
            data-composer
            className={cn(
              'group/composer shadow-composer focus-within:border-line-strong relative flex flex-col rounded-lg border transition-[border-color] duration-120 ease-out',
              off ? 'bg-chrome' : 'bg-background',
              shellMode && 'composer-shell'
            )}
          >
            {onShell !== undefined && <PixelWipe on={shellMode} />}
            {/* Prompts sent while Claude works: one line each, at the top of the box. */}
            {state.queued.length > 0 && (
              <div className="flex flex-col overflow-hidden rounded-t-lg">
                <QueuedPrompts
                  turns={state.queued}
                  onEdit={onUnqueue && ((turns) => void takeBack(turns, true))}
                  onCancel={onUnqueue && ((turns) => void takeBack(turns, false))}
                />
              </div>
            )}
            {menu.length > 0 && (
              <CommandMenu
                id={menuId}
                items={menu}
                query={slot?.query ?? ''}
                hot={at}
                onHover={setHot}
                onPick={accept}
              />
            )}
            {hint && <CommandHint command={hint} />}
            <ImageStrip
              images={images}
              className="px-4 pt-3.5"
              onRemove={(i) => {
                setImages(images.filter((_, j) => j !== i))
                field.current?.focus()
              }}
            />
            <Textarea
              ref={twin}
              aria-hidden
              tabIndex={-1}
              readOnly
              rows={1}
              className={cn(
                COMPOSER_FIELD,
                shellMode && SHELL_FIELD,
                'pointer-events-none invisible absolute top-0 left-0 h-0'
              )}
            />
            {named.length > 0 && (
              <div
                ref={marks}
                aria-hidden
                className="pointer-events-none absolute left-0 overflow-hidden break-words whitespace-pre-wrap text-transparent"
              >
                {segments(draft, named)}
              </div>
            )}
            {shellMode && (
              <span
                aria-hidden
                className="text-tan pointer-events-none absolute left-4 z-10 text-base leading-6 font-semibold"
                style={{ top: field.current ? field.current.offsetTop + 10 : undefined }}
              >
                $
              </span>
            )}
            <Textarea
              ref={field}
              // One line empty (74px with its toolbar); it grows as the prompt does. Above the
              // marks, which show through its transparent background.
              className={cn(COMPOSER_FIELD, 'relative', shellMode && SHELL_FIELD)}
              rows={1}
              value={shown}
              placeholder={placeholder}
              disabled={off}
              role="combobox"
              aria-expanded={menu.length > 0}
              aria-controls={menuId}
              aria-autocomplete="list"
              aria-activedescendant={menu.length > 0 ? `${menuId}-${at}` : undefined}
              onChange={(e) => {
                const text = e.target.value
                edit(draft.slice(0, lead) + text, e.target.selectionStart + lead)
              }}
              onSelect={(e) => setCaret(e.currentTarget.selectionStart + lead)}
              onScroll={(e) => {
                if (marks.current) marks.current.scrollTop = e.currentTarget.scrollTop
              }}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
            />
            <div className="flex h-10 flex-none items-center gap-1 px-2">
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
              <ContextMeter
                context={state.context}
                usage={state.usage}
                onOpen={onAskUsage}
                model={state.model}
                onSend={(command) => onSend(command, [])}
              />
              {/* Where the keys go from anywhere; gone once they are here. */}
              {!off && (
                <Kbd className="text-label mr-1.5 transition-opacity duration-120 ease-out group-focus-within/composer:opacity-0">
                  ⌘L
                </Kbd>
              )}
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
                  aria-label={shellMode ? 'Run (Enter)' : 'Send (Enter)'}
                  data-tip={shellMode ? 'Run · Enter' : 'Send · Enter'}
                  data-tip-side="top"
                  disabled={off || (draft.trim() === '' && images.length === 0)}
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
