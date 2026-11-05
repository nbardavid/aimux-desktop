import { Channel, invoke } from '@tauri-apps/api/core'
import { useCallback, useMemo, useRef, useState } from 'react'

import {
  addUserTurn,
  type ChatState,
  initialChat,
  initializeLine,
  interruptLine,
  type Permission,
  permissionLine,
  reduceLine,
  resolvePermission,
  userLine,
} from '../chat/model'

export interface ChatTab {
  id: string
  cwd: string
  title: string
  state: ChatState
}

const TITLE_LENGTH = 40

/** Native chats over Claude Code run headless, one process each, local to this window. */
export function useChats() {
  const [chats, setChats] = useState<ChatTab[]>([])
  // The process id lands after the tab exists: what is sent meanwhile waits for it.
  const procs = useRef(new Map<string, Promise<number>>())

  const edit = useCallback((id: string, f: (chat: ChatTab) => ChatTab) => {
    setChats((list) => list.map((c) => (c.id === id ? f(c) : c)))
  }, [])

  const write = useCallback(async (id: string, line: string) => {
    const proc = procs.current.get(id)
    if (proc === undefined) return
    await invoke('chat_send', { id: await proc, line })
  }, [])

  const create = useCallback(
    (cwd: string, agent: { model: string; effort: string } = { effort: '', model: '' }) => {
      const id = crypto.randomUUID()
      setChats((list) => [...list, { cwd, id, state: initialChat, title: 'New chat' }])
      const onLine = new Channel<string>()
      onLine.onmessage = (line) => edit(id, (c) => ({ ...c, state: reduceLine(c.state, line) }))
      const proc = invoke<number>('chat_start', { cwd, onLine, resume: null, ...agent })
      procs.current.set(id, proc)
      proc
        .then(async (procId) =>
          invoke('chat_send', { id: procId, line: initializeLine(`init-${id}`) })
        )
        .catch((error: unknown) =>
          edit(id, (c) => ({
            ...c,
            state: { ...c.state, errors: [String(error)], status: 'exited' },
          }))
        )
      return id
    },
    [edit]
  )

  const send = useCallback(
    (id: string, text: string) => {
      edit(id, (c) => {
        const first = !c.state.turns.some((t) => t.role === 'user')
        const title = first ? text.replaceAll(/\s+/g, ' ').trim().slice(0, TITLE_LENGTH) : c.title
        return { ...c, state: addUserTurn(c.state, text, crypto.randomUUID()), title }
      })
      // Claude Code fills in its own session id; an empty one is accepted.
      void write(id, userLine(text, null))
    },
    [edit, write]
  )

  const answer = useCallback(
    (id: string, permission: Permission, choice: 'allow' | 'always' | 'deny') => {
      edit(id, (c) => ({ ...c, state: resolvePermission(c.state, permission.requestId) }))
      void write(id, permissionLine(permission, choice))
    },
    [edit, write]
  )

  const interrupt = useCallback(
    (id: string) => void write(id, interruptLine(`stop-${crypto.randomUUID()}`)),
    [write]
  )

  const rename = useCallback(
    (id: string, title: string) => edit(id, (c) => ({ ...c, title })),
    [edit]
  )

  const close = useCallback((id: string) => {
    const proc = procs.current.get(id)
    procs.current.delete(id)
    setChats((list) => list.filter((c) => c.id !== id))
    void proc?.then(async (procId) => invoke('chat_stop', { id: procId }))
  }, [])

  return useMemo(
    () => ({ answer, chats, close, create, interrupt, rename, send }),
    [answer, chats, close, create, interrupt, rename, send]
  )
}
