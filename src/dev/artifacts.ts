// Artifacts in the browser preview: a chat that publishes one (`?artifacts` uses fake-artifacts.ts).

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
    tool('tool-page', 'Write', { content: '<title>logit 0.2</title>…', file_path: SCRATCH }),
    tool('tool-publish', 'Artifact', { file_path: SCRATCH, title: 'logit 0.2 at a glance' }),
  ]),
  result('tool-page', `File created successfully at: ${SCRATCH}`),
  result('tool-publish', `Published ${SCRATCH} at ${URL} (Version 1, version id 1-9d34).`),
]
