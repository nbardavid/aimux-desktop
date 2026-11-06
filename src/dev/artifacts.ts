// Artifacts in the browser preview: a chat that publishes one, and `?artifacts`' two pages.

const SCRATCH = '/private/tmp/claude-501/-Users-dev/session-notes/scratchpad/release-notes.html'
const URL = 'https://claude.ai/artifact/Q7qKRZLjujn7avFRs7C3Bv'

const assistant = (id: string, content: unknown[]) =>
  JSON.stringify({
    message: { content, id, model: 'claude-sonnet-5-5', role: 'assistant' },
    type: 'assistant',
  })
const result = (id: string, content: string) =>
  JSON.stringify({
    message: {
      content: [{ content, is_error: false, tool_use_id: id, type: 'tool_result' }],
      role: 'user',
    },
    type: 'user',
  })
const tool = (id: string, name: string, input: Record<string, unknown>) => ({
  id,
  input,
  name,
  type: 'tool_use',
})

/** Claude Code's own calls for a publish: quickstart, the page written, then published. */
export const PUBLISH_LINES = [
  assistant('m-art-1', [
    tool('tool-quickstart', 'Artifact', {
      action: 'quickstart',
      design_systems: false,
      intent: 'document',
    }),
  ]),
  result('tool-quickstart', 'Quickstart. Otherwise make a plain page.'),
  assistant('m-art-2', [
    tool('tool-page', 'Write', { content: '<title>aimux 0.2</title>…', file_path: SCRATCH }),
    tool('tool-publish', 'Artifact', { file_path: SCRATCH, title: 'aimux 0.2 at a glance' }),
  ]),
  result('tool-page', `File created successfully at: ${SCRATCH}`),
  result('tool-publish', `Published ${SCRATCH} at ${URL} (Version 1, version id 1-9d34).`),
]

/** `?artifacts`: two pages on amber, the newer one never opened. */
export const ARTIFACTS = [
  {
    at: Date.now() - 30 * 60_000,
    chatId: 'chat-menus',
    seenAt: Date.now() - 20 * 60_000,
    title: 'Menus: before and after Base UI',
    url: 'https://claude.ai/artifact/Mn8hTq2RvKx4LsYp7DdWc1',
  },
  {
    at: Date.now() - 2 * 60_000,
    chatId: 'chat-menus',
    title: 'How the context menu keeps its row',
    url: 'https://claude.ai/code/artifact/5f0c2a9e-41b7-4c55-9a1e-0d2b7c3e8f61',
  },
]
