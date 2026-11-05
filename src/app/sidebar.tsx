import type { TabSessionSummary } from '@aimux/ipc'

import type { ProjectEntry } from './use-daemon'

interface Props {
  projects: ProjectEntry[]
  projectId: string | null
  tabs: TabSessionSummary[]
  tabId: string | undefined
  onProject: (id: string) => void
  onTab: (id: string) => void
}

const ACTIVITY_LABEL = {
  'idle': 'Idle',
  'waiting-input': 'Waiting for you',
  'working': 'Working',
} as const

export function Sidebar({ onProject, onTab, projectId, projects, tabId, tabs }: Props) {
  return (
    <nav className="sidebar">
      <h2>Projects</h2>
      <ul>
        {projects.map((project) => (
          <li key={project.id}>
            <button
              type="button"
              aria-current={project.id === projectId}
              title={project.projectPath}
              onClick={() => onProject(project.id)}
            >
              {project.name}
            </button>
          </li>
        ))}
      </ul>
      <h2>Tabs</h2>
      <ul>
        {tabs.map((tab) => (
          <li key={tab.id}>
            <button type="button" aria-current={tab.id === tabId} onClick={() => onTab(tab.id)}>
              <span
                className={`activity activity-${tab.activity ?? 'unknown'}`}
                title={tab.activity ? ACTIVITY_LABEL[tab.activity] : 'Unknown'}
              />
              {tab.title}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
