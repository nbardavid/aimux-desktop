import { CheckIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { cn } from '@/lib/utils'

import type { Permission, Question } from '../chat/model'

/** What a question's picks send back: the labels (", " between), then what was typed. */
export function answerOf(q: Question, picked: string[], other: string): string {
  const typed = other.trim()
  if (!q.multiSelect) return typed || (picked[0] ?? '')
  return [...picked, ...(typed ? [typed] : [])].join(', ')
}

const ROW =
  'flex w-full items-start gap-2.5 rounded-md border px-2.5 py-2 text-left transition-colors duration-120 ease-out hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring'

/**
 * AskUserQuestion: Claude waits on a pick. One single-choice question answers on click;
 * otherwise the picks go with Submit (⌘↩). Skip (⌘⌫) declines, and Claude goes on without.
 */
export function QuestionCard({
  disabled,
  onAnswer,
  permission,
  questions,
}: {
  permission: Permission
  questions: Question[]
  disabled: boolean
  onAnswer: (choice: 'allow' | 'deny', answers?: Record<string, string>) => void
}) {
  const [picked, setPicked] = useState<string[][]>(() => questions.map(() => []))
  const [other, setOther] = useState<string[]>(() => questions.map(() => ''))
  const answers = Object.fromEntries(
    questions.map((q, i) => [q.question, answerOf(q, picked[i] ?? [], other[i] ?? '')])
  )
  const complete = Object.values(answers).every((a) => a !== '')
  const instant = questions.length === 1 && questions[0]?.multiSelect === false

  const submit = () => {
    if (complete && !disabled) onAnswer('allow', answers)
  }
  const pick = (i: number, q: Question, label: string) => {
    if (disabled) return
    if (instant) {
      onAnswer('allow', { [q.question]: label })
      return
    }
    setPicked((all) =>
      all.map((p, j) => {
        if (j !== i) return p
        if (!q.multiSelect) return [label]
        return p.includes(label) ? p.filter((l) => l !== label) : [...p, label]
      })
    )
    // A single choice is the option or the typed answer, not both.
    if (!q.multiSelect) setOther((all) => all.map((o, j) => (j === i ? '' : o)))
  }

  // ⌘↩ and ⌘⌫ from anywhere in the chat, as on a permission; ⌘⌫ in a field edits it.
  const card = useRef<HTMLDivElement>(null)
  const keys = useRef({ disabled, onAnswer, submit })
  keys.current = { disabled, onAnswer, submit }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !e.metaKey || keys.current.disabled) return
      const typing =
        e.target instanceof HTMLInputElement && card.current?.contains(e.target) === true
      if (e.key === 'Enter' && !e.shiftKey) keys.current.submit()
      else if (e.key === 'Backspace' && !typing) keys.current.onAnswer('deny')
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div
      ref={card}
      className={cn(
        'flex flex-col gap-3 rounded-lg border border-line-strong bg-background px-3.5 py-3 transition-opacity duration-160',
        'animate-in fade-in slide-in-from-bottom-[6px] duration-200 ease-out',
        disabled && 'opacity-60'
      )}
      aria-disabled={disabled || undefined}
      role="alertdialog"
      aria-label={questions.length === 1 ? questions[0]?.question : 'Claude asks'}
      data-request={permission.requestId}
    >
      {questions.map((q, i) => (
        <fieldset key={q.question} className="flex flex-col gap-1.5" disabled={disabled}>
          <legend className="contents">
            {q.header !== '' && <span className="text-faint text-xs">{q.header}</span>}
            <span className="text-base font-semibold">{q.question}</span>
          </legend>
          <div className="mt-0.5 flex flex-col gap-1">
            {q.options.map((o) => {
              const on = picked[i]?.includes(o.label) === true
              return (
                <button
                  key={o.label}
                  type="button"
                  role={q.multiSelect ? 'checkbox' : 'radio'}
                  aria-checked={on}
                  className={cn(
                    ROW,
                    on ? 'border-line-strong bg-active hover:bg-active' : 'border-line'
                  )}
                  onClick={() => pick(i, q, o.label)}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm font-medium text-ink">{o.label}</span>
                    {o.description !== '' && (
                      <span className="text-label text-sm">{o.description}</span>
                    )}
                  </span>
                  <CheckIcon
                    className={cn(
                      'mt-[3px] size-3.5 flex-none text-ink transition-opacity duration-120',
                      on ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                </button>
              )
            })}
            <input
              className="h-8 w-full rounded-md border border-line bg-background px-2.5 text-sm outline-none transition-colors duration-120 placeholder:text-faint focus:border-line-strong"
              placeholder="Other…"
              aria-label={`Other answer to ${q.question}`}
              value={other[i] ?? ''}
              onChange={(e) => {
                const text = e.target.value
                setOther((all) => all.map((o, j) => (j === i ? text : o)))
                if (!q.multiSelect && text !== '')
                  setPicked((all) => all.map((p, j) => (j === i ? [] : p)))
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.metaKey) {
                  e.preventDefault()
                  submit()
                }
              }}
            />
          </div>
        </fieldset>
      ))}
      {/* No button takes the focus: a key meant for the composer never answers. */}
      <div className="flex justify-end gap-1.5">
        <Button
          variant="secondary"
          size="sm"
          className="disabled:opacity-100"
          aria-keyshortcuts="Meta+Backspace"
          disabled={disabled}
          onClick={() => onAnswer('deny')}
        >
          Skip
          <Kbd>⌘⌫</Kbd>
        </Button>
        <Button
          size="sm"
          className="disabled:bg-line-strong disabled:opacity-100"
          aria-keyshortcuts="Meta+Enter"
          disabled={disabled || !complete}
          onClick={submit}
        >
          Submit
          <Kbd className="text-white/60">⌘↩</Kbd>
        </Button>
      </div>
    </div>
  )
}
