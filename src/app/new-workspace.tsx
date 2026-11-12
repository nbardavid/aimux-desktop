import { invoke } from '@tauri-apps/api/core'
import { ChevronDownIcon, GitBranchIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Kbd } from '@/components/ui/kbd'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/menu'
import { cn } from '@/lib/utils'

import type { Project } from '../model/catalog'

import { type ChatSettings, cycleEffort, type ModelInfo } from '../model/agents'
import { ModelSelect } from './agent-select'
import { Combo, type ComboOption } from './combo'
import { ProjectAvatar } from './sidebar'

interface Props {
  projects: Project[]
  projectId: string
  selection: ChatSettings
  models: ModelInfo[]
  onSelection: (s: ChatSettings) => void
  onCreate: (projectId: string, base: string | null, prompt: string) => Promise<void>
  onClose: () => void
}

const RECENT = 'logit.bases'

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

const DRAFTS = 'logit.composer.drafts'

/** The unsent prompt of each project: closing the composer by mistake loses nothing. */
function loadDrafts(): Record<string, string> {
  try {
    const all: unknown = JSON.parse(localStorage.getItem(DRAFTS) ?? '{}')
    return typeof all === 'object' && all !== null ? (all as Record<string, string>) : {}
  } catch {
    return {}
  }
}

function saveDrafts(all: Record<string, string>) {
  try {
    localStorage.setItem(DRAFTS, JSON.stringify(all))
  } catch {
    // Only a convenience: the next composer starts empty.
  }
}

/** A launch that failed before its workspace existed: the next composer reopens on its prompt. */
export function keepDraft(projectId: string, prompt: string) {
  saveDrafts({ ...loadDrafts(), [projectId]: prompt })
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
  const [drafts, setDrafts] = useState(loadDrafts)
  const prompt = typeof drafts[projectId] === 'string' ? drafts[projectId] : ''
  const setPrompt = (text: string) =>
    setDrafts((all) => {
      const next = { ...all }
      if (text === '') delete next[projectId]
      else next[projectId] = text
      saveDrafts(next)
      return next
    })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const field = useRef<HTMLTextAreaElement>(null)
  const project = props.projects.find((p) => p.id === projectId)
  const branches = useBranches(project?.path)
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

  const create = () => {
    if (busy) return
    setBusy(true)
    setError(null)
    if (base !== null) rememberBase(projectId, base)
    props.onCreate(projectId, base, prompt.trim()).then(
      () => {
        // Sent: this project's draft is done with.
        const rest = { ...loadDrafts() }
        delete rest[projectId]
        saveDrafts(rest)
        props.onClose()
      },
      (error_: unknown) => {
        setBusy(false)
        setError(String(error_).replace(/^Error: /, ''))
      }
    )
  }

  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent
        aria-label="New workspace"
        initialFocus={field}
        className="w-[min(680px,calc(100%-32px))]"
        onKeyDown={(e) => {
          // ⇧⌘/ walks the model's efforts, as in Conductor.
          if (e.metaKey && e.shiftKey && (e.key === '/' || e.code === 'Slash')) {
            e.preventDefault()
            props.onSelection(cycleEffort(props.selection, props.models))
          }
        }}
      >
        <div className="border-border flex h-12 flex-none items-center gap-2 border-b px-2.5">
          <Menu>
            <MenuTrigger className="group hover:bg-hover data-popup-open:bg-hover inline-flex h-8 items-center gap-2 rounded-lg pr-2 pl-[7px] text-sm font-medium transition-colors duration-120">
              {project && <ProjectAvatar name={project.name} />}
              {project?.name ?? 'Project'}
              <ChevronDownIcon className="text-label size-3.5 flex-none" />
            </MenuTrigger>
            <MenuContent
              aria-label="Projects"
              finalFocus={field}
              className="max-h-[min(280px,var(--available-height))] min-w-[220px]"
            >
              {props.projects.map((p) => (
                <MenuItem
                  key={p.id}
                  className={cn(
                    p.id === projectId && 'bg-active data-highlighted:bg-active font-medium'
                  )}
                  onClick={() => setProjectId(p.id)}
                >
                  <ProjectAvatar name={p.name} />
                  {p.name}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
          <span className="min-w-0 flex-1" />
          {base !== null && (
            <Combo
              className="text-muted-foreground h-7 pr-1.5 pl-2 font-mono text-xs font-normal"
              align="end"
              alignOffset={6}
              popupClassName="w-[280px]"
              finalFocus={field}
              button={
                <>
                  <GitBranchIcon className="size-3.5 flex-none" />
                  <span className="max-w-[180px] truncate">{base}</span>
                </>
              }
              options={baseOptions}
              selected={base}
              placeholder="Search branches"
              onPick={(b) => setPicked({ base: b, projectId })}
            />
          )}
        </div>
        <textarea
          ref={field}
          className="text-foreground placeholder:text-label max-h-[50vh] min-h-32 resize-none border-0 bg-transparent p-4 text-[15px] leading-6 outline-none select-text"
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
        {error !== null && <div className="text-critical-ink px-4 pb-2 text-sm">{error}</div>}
        <div className="flex h-12 flex-none items-center gap-3 pr-2.5 pl-2">
          <ModelSelect value={props.selection} models={props.models} onChange={props.onSelection} />
          <span className="min-w-0 flex-1" />
          <span className="text-faint text-xs">
            {prompt.trim() === '' ? 'Starts without a prompt' : '⇧↩ new line'}
          </span>
          <Button size="sm" disabled={busy} onClick={create}>
            {busy ? 'Creating…' : 'Create'}
            {!busy && <Kbd className="text-white/60">↩</Kbd>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
