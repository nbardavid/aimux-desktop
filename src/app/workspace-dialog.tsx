import { type FormEvent, useState } from 'react'

interface Props {
  projectName: string
  onCreate: (name: string, base: string | null) => Promise<void>
  onClose: () => void
}

/** A git worktree on a new `aimux/<name>` branch, as `aimux workspace create` makes it. */
export function WorkspaceDialog({ onClose, onCreate, projectName }: Props) {
  const [name, setName] = useState('')
  const [base, setBase] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const slug = name.trim()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (slug === '' || busy) return
    setBusy(true)
    onCreate(slug, base.trim() === '' ? null : base.trim()).then(onClose, (error_: unknown) => {
      setBusy(false)
      setError(String(error_))
    })
  }

  return (
    <div className="scrim" onMouseDown={onClose}>
      <form
        className="dialog"
        aria-labelledby="ws-title"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
        onSubmit={submit}
      >
        <div className="dialog-head" id="ws-title">
          New workspace in {projectName}
        </div>
        <div className="form">
          <label className="field">
            <span className="field-label">Name</span>
            {/* oxlint-disable-next-line jsx-a11y/no-autofocus -- the dialog opens to type a name */}
            <input
              className="input"
              value={name}
              autoFocus
              placeholder="review"
              onChange={(e) => setName(e.target.value)}
            />
            <span className="field-hint">Branch aimux/{slug === '' ? '<name>' : slug}</span>
          </label>
          <label className="field">
            <span className="field-label">Fork from</span>
            <input
              className="input"
              value={base}
              placeholder="HEAD"
              onChange={(e) => setBase(e.target.value)}
            />
          </label>
          {error !== null && <span className="field-error">{error}</span>}
        </div>
        <div className="dialog-foot actions">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={slug === '' || busy}>
            {busy ? 'Creating…' : 'Create workspace'}
          </button>
        </div>
      </form>
    </div>
  )
}
