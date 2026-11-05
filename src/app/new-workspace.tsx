import { invoke } from '@tauri-apps/api/core'
import { useEffect, useRef, useState } from 'react'

import type { ProjectEntry } from '../model/catalog'

import { type ChatSettings, cycleEffort, type ModelInfo } from '../model/agents'
import { suggestName } from '../model/names'
import { ModelSelect } from './agent-select'
import { Combo, type ComboOption } from './combo'
import { Icon } from './icons'
import { ProjectAvatar } from './sidebar'

interface Props {
  projects: ProjectEntry[]
  projectId: string
  /** Names already used in each project, so the new one never collides. */
  takenNames: (projectId: string) => string[]
  selection: ChatSettings
  models: ModelInfo[]
  onSelection: (s: ChatSettings) => void
  onCreate: (projectId: string, name: string, base: string | null, prompt: string) => Promise<void>
  onClose: () => void
}

const RECENT = 'aimux.bases'

/** The bases picked last in each project, newest first. */
function recentBases(): Record<string, string[]> {
  try {
    return JSON.parse(localStorage.getItem(RECENT) ?? '{}') as Record<string, string[]>
  } catch {
    return {}
  }
}

function rememberBase(projectId: string, base: string) {
  const all = recentBases()
  all[projectId] = [base, ...(all[projectId] ?? []).filter((b) => b !== base)].slice(0, 5)
  try {
    localStorage.setItem(RECENT, JSON.stringify(all))
  } catch {
    // Only a convenience: the next pick starts from the default branch again.
  }
}

interface Branches {
  branches: string[]
  default: string | null
}

/** The project's branches, and the one a new workspace forks from unless you pick another. */
function useBranches(path: string | undefined) {
  const [state, setState] = useState<{ path?: string; branches: Branches | null }>({
    branches: null,
  })
  useEffect(() => {
    if (path === undefined) return
    let live = true
    invoke<Branches>('git_branches', { path }).then(
      (branches) => live && setState({ branches, path }),
      () => live && setState({ branches: null, path })
    )
    return () => {
      live = false
    }
  }, [path])
  return state.path === path ? state.branches : null
}

/** One box for a new piece of work: where, what to ask, and who does it. Enter starts it. */
export function NewWorkspace(props: Props) {
  const [projectId, setProjectId] = useState(props.projectId)
  const [prompt, setPrompt] = useState('')
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const field = useRef<HTMLTextAreaElement>(null)
  const project = props.projects.find((p) => p.id === projectId)
  const branches = useBranches(project?.projectPath)
  const [picked, setPicked] = useState<{ projectId: string; base: string } | null>(null)
  const base = picked?.projectId === projectId ? picked.base : (branches?.default ?? null)
  const recent = (recentBases()[projectId] ?? []).filter(
    (b) => branches?.branches.includes(b) === true
  )
  const baseOptions: ComboOption[] = [
    ...recent.map((b) => ({ label: b, section: 'Recent', value: b })),
    ...(branches?.branches ?? []).map((b) => ({
      hint: b === branches?.default ? 'default' : undefined,
      label: b,
      section: 'Branches',
      value: b,
    })),
  ]

  useEffect(() => field.current?.focus(), [])

  const create = () => {
    if (busy) return
    setBusy(true)
    setError(null)
    if (base !== null) rememberBase(projectId, base)
    props
      .onCreate(projectId, suggestName(props.takenNames(projectId)), base, prompt.trim())
      .then(props.onClose, (error_: unknown) => {
        setBusy(false)
        setError(String(error_).replace(/^Error: /, ''))
      })
  }

  return (
    <div className="scrim" onMouseDown={props.onClose}>
      <div
        className="nw"
        role="dialog"
        aria-label="New workspace"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') props.onClose()
          // ⇧⌘/ walks the model's efforts, as in Conductor.
          if (e.metaKey && e.shiftKey && (e.key === '/' || e.code === 'Slash')) {
            e.preventDefault()
            props.onSelection(cycleEffort(props.selection, props.models))
          }
        }}
      >
        <div className="nw-head">
          <div className="nw-project">
            <button
              type="button"
              className="nw-pick"
              aria-expanded={picking}
              onClick={() => setPicking((p) => !p)}
            >
              {project && <ProjectAvatar name={project.name} />}
              {project?.name ?? 'Project'}
              <span className={picking ? 'chev is-down' : 'chev is-side'}>
                <Icon name="chevron" small />
              </span>
            </button>
            {picking && (
              <div className="nw-projects" role="listbox" aria-label="Projects">
                {props.projects.map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    role="option"
                    aria-selected={p.id === projectId}
                    className={p.id === projectId ? 'nw-option is-on' : 'nw-option'}
                    onClick={() => {
                      setProjectId(p.id)
                      setPicking(false)
                      field.current?.focus()
                    }}
                  >
                    <ProjectAvatar name={p.name} />
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className="grow" />
          {base !== null && (
            <Combo
              className="nw-base"
              button={
                <>
                  <Icon name="branch" small />
                  <span className="nw-base-name">{base}</span>
                </>
              }
              options={baseOptions}
              selected={base}
              placeholder="Search branches"
              onPick={(b) => {
                setPicked({ base: b, projectId })
                field.current?.focus()
              }}
            />
          )}
        </div>
        <textarea
          ref={field}
          className="nw-field"
          value={prompt}
          placeholder="What do you want to work on?"
          disabled={busy}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              create()
            }
          }}
        />
        {error !== null && <div className="nw-error">{error}</div>}
        <div className="nw-foot">
          <ModelSelect value={props.selection} models={props.models} onChange={props.onSelection} />
          <span className="grow" />
          <span className="faint nw-hint">
            {prompt.trim() === '' ? 'Starts without a prompt' : '⇧↵ new line'}
          </span>
          <button type="button" className="btn btn-ink nw-create" disabled={busy} onClick={create}>
            {busy ? 'Creating…' : 'Create'}
            {!busy && <span className="nw-enter">↵</span>}
          </button>
        </div>
      </div>
    </div>
  )
}
