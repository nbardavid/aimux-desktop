// Sub-agents in the browser preview: one that finished (in the release-notes chat) and one
// still at work beside a permission (in the busy chat).
import { PUBLISH_LINES } from './artifacts'

const line = (value: unknown) => JSON.stringify(value)
const assistant = (id: string, content: unknown[], parent: string | null = null) =>
  line({
    message: { content, id, model: 'claude-opus-5-5', role: 'assistant' },
    parent_tool_use_id: parent,
    type: 'assistant',
  })
const toolResult = (id: string, content: string, parent: string | null = null) =>
  line({
    message: {
      content: [{ content, is_error: false, tool_use_id: id, type: 'tool_result' }],
      role: 'user',
    },
    parent_tool_use_id: parent,
    type: 'user',
  })
const tool = (id: string, name: string, input: Record<string, unknown>) => ({
  id,
  input,
  name,
  type: 'tool_use',
})
const call = (id: string, description: string, type: string, prompt: string) =>
  tool(id, 'Agent', { description, prompt, subagent_type: type })

/** An Explore agent that read the merged PRs and answered. */
export const AGENT_DONE_LINES = [
  assistant('m-agent-1', [
    call(
      'agent-prs',
      'List merged PRs since 0.1',
      'Explore',
      'List every PR merged since the v0.1.0 tag with its title and a one-line summary.'
    ),
  ]),
  assistant(
    'm-sub-1',
    [tool('sub-log', 'Bash', { command: 'git log v0.1.0..main --merges' })],
    'agent-prs'
  ),
  toolResult('sub-log', 'Merge pull request #3…\nMerge pull request #4…', 'agent-prs'),
  assistant(
    'm-sub-2',
    [tool('sub-read', 'Read', { file_path: '/Users/dev/aimux/CHANGELOG.md' })],
    'agent-prs'
  ),
  toolResult('sub-read', '# Changelog', 'agent-prs'),
  assistant(
    'm-sub-3',
    [
      {
        text: 'Three PRs since 0.1: slash commands (#3), `/resume` (#4), self-updating releases (#5).',
        type: 'text',
      },
    ],
    'agent-prs'
  ),
  toolResult('agent-prs', 'Three PRs since 0.1: slash commands, /resume, self-updating releases.'),
]

/** A general-purpose agent still looking for flaky tests. */
export const AGENT_RUNNING_LINES = [
  assistant('m-agent-2', [
    call(
      'agent-flaky',
      'Find flaky tests',
      'general-purpose',
      'Run the test suite three times and list every test whose result changes between runs.'
    ),
  ]),
  assistant(
    'm-sub-4',
    [tool('sub-grep', 'Grep', { path: 'src', pattern: 'setTimeout' })],
    'agent-flaky'
  ),
  toolResult('sub-grep', 'src/app/toast.tsx\nsrc/app/use-host.ts', 'agent-flaky'),
  assistant('m-sub-5', [tool('sub-run', 'Bash', { command: 'bun test src/app' })], 'agent-flaky'),
]

/** The release-notes chat's work: a sub-agent, then an artifact (the right panel lists it). */
export const NOTES_WORK = [...AGENT_DONE_LINES, ...PUBLISH_LINES]
