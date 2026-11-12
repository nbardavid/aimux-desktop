import {
  assistant,
  HOME,
  initAnswer,
  LIVE,
  result,
  sent,
  systemInit,
  toolResult,
  TREES,
} from './fixtures'

const now = Date.now()
const MIN = 60_000
const HOUR = 60 * MIN

const LOREM =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.'

/**
 * `?heavy`: many running chats, each with a long past the host replays on reattach, as after
 * an update. For profiling the window's start.
 */
export function heavyFixture(workspaces = 12, turns = 300) {
  const path = `${HOME}/dev/heavy`
  const ids = Array.from({ length: workspaces }, (_, i) => `heavy-${i}`)
  const replay = (id: string) => [
    initAnswer(id),
    systemInit(`session-${id}`, 'claude-opus-5-5'),
    ...Array.from({ length: turns }, (_, t) => [
      sent(`u-${id}-${t}`, `${t}: ${LOREM.slice(0, 80)}`),
      assistant(`m-${id}-${t}`, [
        { text: `${LOREM}\n\n${LOREM}`, type: 'text' },
        {
          id: `tool-${id}-${t}`,
          input: { file_path: `${path}/src/file-${t}.ts` },
          name: 'Read',
          type: 'tool_use',
        },
      ]),
      toolResult(`tool-${id}-${t}`, LOREM.repeat(4)),
      assistant(`m-${id}-${t}-b`, [{ text: LOREM, type: 'text' }]),
      result(0.01, 4000),
    ]).flat(),
    LIVE,
  ]
  return {
    chats: ids.map((id, i) => ({
      createdAt: now - (workspaces - i) * MIN,
      effort: '',
      id: `chat-${id}`,
      model: '',
      sessionId: null,
      title: `Heavy chat ${i + 1}`,
      workspaceId: `ws-${id}`,
    })),
    hosted: ids.map((id) => ({
      alive: true,
      historyLen: 0,
      id: `chat-${id}`,
      unread: false,
      waiting: false,
      working: false,
    })),
    lines: Object.fromEntries(ids.map((id) => [`chat-${id}`, replay(`chat-${id}`)])),
    project: { id: 'p-heavy', lastOpenedAt: now + 2 * HOUR, name: 'heavy', path },
    workspaces: ids.map((id, i) => ({
      base: 'origin/main',
      branch: `logit/${id}`,
      createdAt: now - HOUR,
      id: `ws-${id}`,
      name: `heavy-${i}`,
      path: `${TREES}/heavy/${id}`,
      projectId: 'p-heavy',
      setup: null,
    })),
  }
}
