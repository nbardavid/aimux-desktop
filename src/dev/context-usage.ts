// What `get_context_usage` answers in the browser preview: the breakdown `/context` prints.

const CATEGORIES: [string, number, boolean?][] = [
  ['System prompt', 2800],
  ['System tools', 16_000],
  ['MCP tools', 631],
  ['MCP server instructions', 1600],
  ['Custom agents', 239],
  ['Memory files', 1700],
  ['Skills', 8600],
  ['Messages', 19_800],
  ['MCP tools (deferred)', 63_400, true],
  ['System tools (deferred)', 23_400, true],
  ['Autocompact buffer', 33_000],
  ['Free space', 915_600],
]

const TOOLS = ['click', 'navigate_page', 'take_screenshot', 'evaluate_script', 'list_pages']

export const usageAnswer = (requestId: string) =>
  JSON.stringify({
    response: {
      request_id: requestId,
      response: {
        categories: CATEGORIES.map(([name, tokens, isDeferred]) => ({
          color: 'inactive',
          isDeferred,
          name,
          tokens,
        })),
        maxTokens: 1_000_000,
        mcpTools: TOOLS.map((t, i) => ({
          isLoaded: i < 2,
          name: `mcp__chrome-devtools__${t}`,
          serverName: 'chrome-devtools',
          tokens: 280 + i * 40,
        })),
        percentage: 5,
        totalTokens: 51_400,
      },
      subtype: 'success',
    },
    type: 'control_response',
  })
