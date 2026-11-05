import type { ListTabsResult, ServerEvent, TabSessionSummary } from '@aimux/ipc'
import type { TerminalModeState, TerminalSnapshot } from '@brimveyn/aimux-config'

import type { DaemonClient } from '../daemon/client'

export interface Viewport {
  snapshot: TerminalSnapshot
  modes: TerminalModeState
}

export interface SessionState {
  tabs: TabSessionSummary[]
  viewports: Record<string, Viewport>
}

export type OpenedProject = ListTabsResult & SessionState

/** Thin attach (never resizes what the TUI drives), then `listTabs` for the tab list. The
 * attach reply seeds the viewports: an idle tab sends no `tabRender` until it prints again. */
export async function openProject(client: DaemonClient, projectId: string): Promise<OpenedProject> {
  const hello = await client.hello()
  const attached = await client.request('attach', {
    cols: 80,
    projectId,
    protocolVersion: hello.selectedVersion,
    rows: 24,
    thin: true,
  })
  const listed = await client.request('listTabs', { projectId })
  if (attached.type !== 'attachResult' || listed.type !== 'listTabsResult') {
    throw new Error(`unexpected ${attached.type}/${listed.type} opening ${projectId}`)
  }
  const viewports: Record<string, Viewport> = {}
  for (const tab of attached.payload.tabs) {
    if (tab.viewport) viewports[tab.id] = { modes: tab.terminalModes, snapshot: tab.viewport }
  }
  return { ...listed.payload, viewports }
}

function updateTab(
  state: SessionState,
  tabId: string,
  patch: Partial<TabSessionSummary>
): SessionState {
  if (!state.tabs.some((tab) => tab.id === tabId)) return state
  return {
    ...state,
    tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, ...patch } : tab)),
  }
}

export function reduceEvent(state: SessionState, event: ServerEvent): SessionState {
  switch (event.type) {
    case 'tabRender': {
      const { tabId, terminalModes, viewport } = event.payload
      return {
        ...state,
        viewports: { ...state.viewports, [tabId]: { modes: terminalModes, snapshot: viewport } },
      }
    }
    case 'tabStatus':
      return updateTab(state, event.payload.tabId, { activity: event.payload.status })
    case 'tabExit': {
      const { tabId } = event.payload
      const { [tabId]: _gone, ...viewports } = state.viewports
      return { tabs: state.tabs.filter((tab) => tab.id !== tabId), viewports }
    }
    case 'tabAdded': {
      const { tab } = event.payload
      if (state.tabs.some((existing) => existing.id === tab.id)) return state
      const summary: TabSessionSummary = {
        activity: tab.activity,
        assistant: tab.assistant,
        command: tab.command,
        id: tab.id,
        status: tab.status,
        title: tab.title,
        workerName: tab.workerName,
        workspaceId: tab.workspaceId,
      }
      return { ...state, tabs: [...state.tabs, summary] }
    }
    case 'tabMetadataUpdated': {
      const { tabId, title } = event.payload
      return title === undefined ? state : updateTab(state, tabId, { title })
    }
    default:
      return state
  }
}

export function attentionFor(
  event: ServerEvent
): { kind: 'question' | 'done'; tabId: string } | null {
  if (event.type === 'tabQuestion') return { kind: 'question', tabId: event.payload.tabId }
  if (event.type === 'tabTurnComplete') return { kind: 'done', tabId: event.payload.tabId }
  return null
}
