import { invoke } from '@tauri-apps/api/core'
import { useEffect, useState } from 'react'

import { Picker, type PickerItem } from './picker'
import { listable, orderSessions, originLabel, type Session } from './resume'

interface Props {
  projectId: string
  /** The project's main checkout. */
  mainPath: string
  /** The project's workspaces, to name where a session ran. */
  workspaces: { id: string; name: string; path: string }[]
  /** The workspace on screen: its sessions come first. */
  currentPath: string
  /** The session of the chat `/resume` was typed in. */
  currentSession: string | null
  /** Sessions open in a tab, with the tab's title: picking one goes to it. */
  openSessions: Record<string, string>
  initialQuery: string
  onPick: (session: Session) => void
  onClose: () => void
}

function age(ms: number): string {
  const m = Math.round((Date.now() - ms) / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  if (m < 60 * 24) return `${Math.round(m / 60)}h ago`
  return `${Math.round(m / (60 * 24))}d ago`
}

/** `/resume`: the project's earlier Claude sessions, wherever in it they ran. */
export function ResumePicker(props: Props) {
  const { currentPath, mainPath, projectId, workspaces } = props
  const [sessions, setSessions] = useState<Session[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void invoke<Session[]>('claude_sessions', { projectId })
      .then((list) => setSessions(orderSessions(list.filter(listable), currentPath)))
      .catch((error_: unknown) => setError(String(error_)))
  }, [currentPath, projectId])

  // An open session says so in place of its age: it is live, and picking it goes to its tab.
  const when = (s: Session) => {
    if (s.id === props.currentSession) return 'this chat'
    return props.openSessions[s.id] === undefined ? age(s.updatedAt) : 'open in tab'
  }
  // A session open in a tab goes by the tab's title, as the tab bar shows it.
  const items: PickerItem[] = (sessions ?? []).map((s) => {
    const label = props.openSessions[s.id] ?? (s.title || s.firstPrompt)
    return {
      key: s.id,
      label,
      meta: `${originLabel(s, workspaces, mainPath)} · ${when(s)}`,
      sub: label === s.firstPrompt ? undefined : s.firstPrompt,
    }
  })
  let empty = 'No earlier sessions in this project.'
  if (error !== null) empty = error
  else if (sessions === null) empty = 'Loading sessions…'

  return (
    <Picker
      title="Resume a session"
      items={items}
      filterable
      initialQuery={props.initialQuery}
      empty={empty}
      onClose={props.onClose}
      onPick={(id) => {
        const session = sessions?.find((s) => s.id === id)
        if (session) props.onPick(session)
      }}
    />
  )
}
