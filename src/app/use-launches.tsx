import { invoke } from '@tauri-apps/api/core'
import { useRef, useState } from 'react'

import { Button } from '@/components/ui/button'

import type { Workspace } from '../model/catalog'

import { LaunchSteps, type Step } from './launch-steps'
import { keepDraft } from './new-workspace'

/** A workspace the composer is getting ready (`ws` once its worktree exists). */
export interface Launch {
  key: string
  projectId: string
  prompt: string
  steps: Step[]
  ws: Workspace | null
  /** The worktree couldn't be made: back to the composer. */
  failed: 'worktree' | null
  leaving: boolean
  /** The chat started: the steps leave once they have caught up. */
  done: boolean
}

interface Deps {
  createWorkspace: (projectId: string, base: string | null, prompt: string) => Promise<Workspace>
  runSetup: (w: Workspace) => Promise<unknown>
  /** The setup script couldn't start: said in a toast, Claude goes on. */
  setupFailed: (error: unknown) => void
  startChat: (w: Workspace, prompt: string) => void
  reopenComposer: (projectId: string) => void
}

// The last check holds a beat, then the steps fade (160ms) and the chat is under them.
const HOLD = 600
const FADE = 170

const message = (error: unknown) => String(error).replace(/^Error: /, '')

/**
 * The composer's Create, off the composer: the worktree, then the chat with the
 * prompt get ready in the background, their steps shown where the chat will be.
 */
export function useLaunches() {
  const [launches, setLaunches] = useState<Launch[]>([])
  // Set by the app on every render: the launches call what it has now.
  const depsRef = useRef<Deps | null>(null)
  const deps = {
    createWorkspace: (pid: string, base: string | null, prompt: string) =>
      need().createWorkspace(pid, base, prompt),
    reopenComposer: (pid: string) => need().reopenComposer(pid),
    runSetup: (w: Workspace) => need().runSetup(w),
    setupFailed: (error: unknown) => need().setupFailed(error),
    startChat: (w: Workspace, prompt: string) => need().startChat(w, prompt),
  }
  const need = () => {
    if (depsRef.current === null) throw new Error('The app is not ready yet.')
    return depsRef.current
  }

  const patch = (key: string, change: (l: Launch) => Partial<Launch>) =>
    setLaunches((all) => all.map((l) => (l.key === key ? { ...l, ...change(l) } : l)))
  const step = (key: string, name: string, state: Step['state'], detail?: string) =>
    patch(key, (l) => ({
      steps: l.steps.map((s) => (s.key === name ? { ...s, detail: detail ?? s.detail, state } : s)),
    }))
  const drop = (key: string) => setLaunches((all) => all.filter((l) => l.key !== key))

  const start = (projectId: string, base: string | null, prompt: string) => {
    const key = crypto.randomUUID()
    const steps: Step[] = [
      {
        detail: base === null ? undefined : `From ${base}`,
        key: 'worktree',
        state: 'active',
        title: 'Creating the worktree',
      },
      { key: 'claude', state: 'pending', title: 'Starting Claude' },
    ]
    setLaunches((all) => [
      ...all,
      { done: false, failed: null, key, leaving: false, projectId, prompt, steps, ws: null },
    ])
    void (async () => {
      let w: Workspace
      try {
        w = await deps.createWorkspace(projectId, base, prompt)
      } catch (error) {
        // Nothing made: the next composer reopens on this prompt.
        keepDraft(projectId, prompt)
        patch(key, () => ({ failed: 'worktree' }))
        step(key, 'worktree', 'failed', message(error))
        return
      }
      patch(key, () => ({ ws: w }))
      step(key, 'worktree', 'done', w.branch)
      // The setup script runs beside Claude, in the dock; how it ends shows there.
      void invoke<{ exists: boolean }>('setup_status', { projectId })
        .then((setup) => (setup.exists ? deps.runSetup(w) : undefined))
        .catch(deps.setupFailed)
      deps.startChat(w, prompt)
      step(key, 'claude', 'done')
      // Claude already works; the steps leave once they have played to the end (`settled`).
      patch(key, () => ({ done: true }))
    })()
  }

  // Launches already on their way out: the screen may report settling more than once.
  const leavingRef = useRef(new Set<string>())
  const settled = (key: string) => {
    if (leavingRef.current.has(key)) return
    leavingRef.current.add(key)
    setTimeout(() => patch(key, () => ({ leaving: true })), HOLD)
    setTimeout(() => {
      leavingRef.current.delete(key)
      drop(key)
    }, HOLD + FADE)
  }

  /** What a stopped launch offers: back to the composer. */
  const actions = (l: Launch) => {
    if (l.failed === 'worktree')
      return (
        <>
          <Button
            variant="secondary"
            className="h-7"
            onClick={() => {
              drop(l.key)
              deps.reopenComposer(l.projectId)
            }}
          >
            Back to the composer
          </Button>
          <Button variant="ghost" className="h-7" onClick={() => drop(l.key)}>
            Dismiss
          </Button>
        </>
      )
    return null
  }

  /** The launch on screen: the one in `wsId`, else one still making its worktree. */
  const view = (wsId: string | undefined) => {
    const l =
      launches.find((x) => x.ws !== null && x.ws.id === wsId) ?? launches.find((x) => x.ws === null)
    if (l === undefined) return null
    return (
      <LaunchSteps
        key={l.key}
        prompt={l.prompt}
        steps={l.steps}
        leaving={l.leaving}
        onSettled={l.done && !l.leaving ? () => settled(l.key) : undefined}
        actions={actions(l)}
      />
    )
  }

  return { deps: depsRef, start, view }
}
