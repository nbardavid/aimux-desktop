import type { FileChange } from './use-git'

interface Props {
  changes: FileChange[]
  selected?: string
  onOpen: (file: FileChange) => void
}

function split(path: string) {
  const cut = path.lastIndexOf('/')
  return { dir: path.slice(0, Math.max(cut, 0)), name: path.slice(cut + 1) }
}

function Section({
  files,
  label,
  onOpen,
  selected,
}: Props & { label: string; files: FileChange[] }) {
  if (files.length === 0) return null
  return (
    <div>
      <div className="git-section">
        {label} <span className="count">{files.length}</span>
      </div>
      {files.map((file) => {
        const { dir, name } = split(file.path)
        return (
          <button
            type="button"
            key={file.path}
            className={file.path === selected ? 'file is-active' : 'file'}
            onClick={() => onOpen(file)}
          >
            <span className={`letter letter-${file.status.toLowerCase()}`}>{file.status}</span>
            <span className="fname">{name}</span>
            <span className="fdir">{dir}</span>
            <span className="nums">
              {file.add === null ? (
                <span className="faint">binary</span>
              ) : (
                <>
                  {file.add > 0 && <span className="add">+{file.add}</span>}
                  {file.del !== null && file.del > 0 && <span className="del">−{file.del}</span>}
                </>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** Changes then Untracked, as the TUI's git pane lists them. */
export function FileList(props: Props) {
  if (props.changes.length === 0) return <div className="quiet">Working tree clean</div>
  return (
    <>
      <Section {...props} label="Modified" files={props.changes.filter((f) => !f.untracked)} />
      <Section {...props} label="Untracked" files={props.changes.filter((f) => f.untracked)} />
    </>
  )
}
