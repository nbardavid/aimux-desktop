import type { ServerEvent, TabSessionSummary } from '@aimux/ipc'
import type { TerminalModeState, TerminalSnapshot } from '@brimveyn/aimux-config'

import { expect, test } from 'bun:test'

import type { DaemonClient } from '../daemon/client'

import { attentionFor, openProject, reduceEvent, type SessionState } from './session'

const modes: TerminalModeState = {
  alternateScrollMode: false,
  bracketedPasteMode: true,
  isAlternateBuffer: false,
  mouseTrackingMode: 'none',
  sendFocusMode: false,
}
const snapshot: TerminalSnapshot = {
  baseY: 0,
  cursorVisible: true,
  lines: [{ spans: [{ text: 'hi' }] }],
  viewportY: 0,
}
const tab = (id: string): TabSessionSummary => ({
  assistant: 'claude',
  command: 'claude',
  id,
  status: 'running',
  title: id,
})
const state = (): SessionState => ({
  tabs: [tab('a'), tab('b')],
  viewports: { a: { modes, snapshot } },
})

test('openProject sends hello, thin attach, listTabs', async () => {
  const calls: { payload: unknown; type: string }[] = []
  const helloResult = {
    capabilities: [],
    maxVersion: 19,
    minVersion: 17,
    processVersion: '1',
    selectedVersion: 18,
  }
  const client = {
    hello: async () => {
      calls.push({ payload: {}, type: 'hello' })
      return helloResult
    },
    request: async (type: string, payload: unknown) => {
      calls.push({ payload, type })
      if (type === 'attach') {
        const attached = { ...tab('a'), buffer: '', terminalModes: modes, viewport: snapshot }
        const result = { activeTabId: 'a', initialProjectStatuses: [], protocolVersion: 18 }
        return { id: '1', payload: { ...result, tabs: [attached] }, type: 'attachResult' }
      }
      return { id: '2', payload: { activeTabId: 'a', tabs: [tab('a')] }, type: 'listTabsResult' }
    },
  } as unknown as DaemonClient
  const opened = await openProject(client, 'p1')
  expect(calls.map((c) => c.type)).toEqual(['hello', 'attach', 'listTabs'])
  expect(calls[1]?.payload).toMatchObject({ projectId: 'p1', protocolVersion: 18, thin: true })
  expect(opened.tabs.map((t) => t.id)).toEqual(['a'])
  expect(opened.viewports.a?.snapshot).toEqual(snapshot)
})

test('tabRender stores the viewport', () => {
  const next = reduceEvent(state(), {
    payload: { tabId: 'b', terminalModes: modes, viewport: snapshot },
    type: 'tabRender',
  })
  expect(next.viewports.b).toEqual({ modes, snapshot })
})

test('tabStatus updates activity', () => {
  const next = reduceEvent(state(), {
    payload: { projectId: 'p', status: 'waiting-input', tabId: 'a' },
    type: 'tabStatus',
  })
  expect(next.tabs[0]?.activity).toBe('waiting-input')
})

test('tabExit removes tab and viewport', () => {
  const next = reduceEvent(state(), { payload: { exitCode: 0, tabId: 'a' }, type: 'tabExit' })
  expect(next.tabs.map((t) => t.id)).toEqual(['b'])
  expect(next.viewports.a).toBeUndefined()
})

test('tabAdded and tabMetadataUpdated', () => {
  const added = reduceEvent(state(), {
    payload: { projectId: 'p', tab: { ...tab('c'), buffer: '', terminalModes: modes } },
    type: 'tabAdded',
  })
  expect(added.tabs.map((t) => t.id)).toEqual(['a', 'b', 'c'])
  const renamed = reduceEvent(added, {
    payload: { projectId: 'p', tabId: 'c', title: 'renamed' },
    type: 'tabMetadataUpdated',
  })
  expect(renamed.tabs[2]?.title).toBe('renamed')
})

test('unknown event returns same state', () => {
  const s = state()
  const ping: ServerEvent = {
    payload: { projectId: 'p', status: { waiting: false, working: false } },
    type: 'projectStatus',
  }
  expect(reduceEvent(s, ping)).toBe(s)
})

test('attentionFor maps question and turn complete', () => {
  expect(
    attentionFor({
      payload: { kind: 'question', projectId: 'p', prompt: '?', tabId: 'a' },
      type: 'tabQuestion',
    })
  ).toEqual({ kind: 'question', tabId: 'a' })
  expect(
    attentionFor({ payload: { idleMs: 1, projectId: 'p', tabId: 'b' }, type: 'tabTurnComplete' })
  ).toEqual({ kind: 'done', tabId: 'b' })
})

test('attentionFor returns null for tabRender', () => {
  expect(
    attentionFor({
      payload: { tabId: 'a', terminalModes: modes, viewport: snapshot },
      type: 'tabRender',
    })
  ).toBeNull()
})
