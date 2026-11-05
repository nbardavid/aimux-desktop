import { invoke } from '@tauri-apps/api/core'
import { ChevronRightIcon, GitBranchIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
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
    props.onCreate(projectId, base, prompt.trim()).then(props.onClose, (error_: unknown) => {
      setBusy(false)
      setError(String(error_).replace(/^Error: /, ''))
    })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent
        aria-label="New workspace"
        initialFocus={field}
        className="w-[min(720px,calc(100%-32px))] rounded-[14px] border-0 bg-[#f6f4f1] shadow-[0_0_0_1px_rgb(43_40_38/0.08),0_28px_72px_-24px_rgb(43_40_38/0.4)] duration-180"
        onKeyDown={(e) => {
          // ⇧⌘/ walks the model's efforts, as in Conductor.
          if (e.metaKey && e.shiftKey && (e.key === '/' || e.code === 'Slash')) {
            e.preventDefault()
            props.onSelection(cycleEffort(props.selection, props.models))
          }
        }}
      >
        <div className="border-border flex h-[52px] items-center gap-2 border-b pr-3.5 pl-2.5">
          <Menu>
            <MenuTrigger className="group hover:bg-foreground/6 data-popup-open:bg-foreground/6 inline-flex h-8 items-center gap-2 rounded-[8px] pr-2 pl-[7px] text-[14px] font-semibold transition-colors duration-120">
              {project && <ProjectAvatar name={project.name} />}
              {project?.name ?? 'Project'}
              <ChevronRightIcon className="text-label size-3.5 flex-none transition-transform duration-150 ease-[cubic-bezier(0.2,0,0,1)] group-data-popup-open:rotate-90" />
            </MenuTrigger>
            <MenuContent
              aria-label="Projects"
              finalFocus={field}
              className="max-h-[min(280px,var(--available-height))] min-w-[220px] shadow-[0_0_0_1px_rgb(43_40_38/0.06),0_12px_32px_-12px_rgb(43_40_38/0.28)] duration-140"
            >
              {props.projects.map((p) => (
                <MenuItem
                  key={p.id}
                  className={cn(
                    'h-8 gap-2.5 rounded-lg px-2',
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
              className="text-muted-foreground -mr-1.5 h-7 pr-1.5 pl-2 font-mono text-[12px]"
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
          className="text-foreground placeholder:text-label max-h-[50vh] min-h-[150px] resize-none border-0 bg-transparent px-[18px] py-4 text-[15px] leading-[1.55] outline-none select-text"
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
        {error !== null && (
          <div className="text-critical px-[18px] pb-2 text-[12.5px]">{error}</div>
        )}
        <div className="flex items-center gap-2.5 pt-2.5 pr-3 pb-3 pl-2.5">
          <ModelSelect value={props.selection} models={props.models} onChange={props.onSelection} />
          <span className="min-w-0 flex-1" />
          <span className="text-faint text-[12px]">
            {prompt.trim() === '' ? 'Starts without a prompt' : '⇧↵ new line'}
          </span>
          <Button className="h-8 pr-2.5 pl-3.5" disabled={busy} onClick={create}>
            {busy ? 'Creating…' : 'Create'}
            {!busy && (
              <span className="grid h-5 min-w-5 place-items-center rounded-[5px] bg-white/14 text-[12px]">
                ↵
              </span>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
