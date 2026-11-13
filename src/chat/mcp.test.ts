import { describe, expect, test } from 'bun:test'

import {
  actionRequest,
  actionsFor,
  mcpAnswer,
  mcpLine,
  type McpServer,
  parseMcpStatus,
} from './mcp'

const server = (over: Partial<McpServer>): McpServer => ({
  error: null,
  name: 'x',
  remote: false,
  scope: null,
  state: 'connected',
  tools: null,
  ...over,
})

describe('parseMcpStatus', () => {
  test('reads each server, an unknown status as pending', () => {
    const list = parseMcpStatus({
      mcpServers: [
        { config: { type: 'http' }, name: 'gh', scope: 'user', status: 'connected', toolCount: 4 },
        { error: 'boom', name: 'f', status: 'failed' },
        { name: 'n', status: 'weird' },
      ],
    })
    expect(list).toEqual([
      { error: null, name: 'gh', remote: true, scope: 'user', state: 'connected', tools: 4 },
      { error: 'boom', name: 'f', remote: false, scope: null, state: 'failed', tools: null },
      { error: null, name: 'n', remote: false, scope: null, state: 'pending', tools: null },
    ])
  })
  test('no list is null', () => expect(parseMcpStatus({})).toBeNull())
})

describe('actionsFor', () => {
  test('leads with what the state needs', () => {
    expect(actionsFor(server({ state: 'disabled' }))).toEqual(['enable'])
    expect(actionsFor(server({ state: 'needs-auth' }))[0]).toBe('authenticate')
    expect(actionsFor(server({ state: 'failed' }))[0]).toBe('reconnect')
  })
  test('only a remote server signs out', () => {
    expect(actionsFor(server({}))).not.toContain('sign-out')
    expect(actionsFor(server({ remote: true }))).toContain('sign-out')
  })
})

test('actionRequest maps to Claude Code subtypes', () => {
  expect(actionRequest('disable', 's')).toEqual({
    enabled: false,
    serverName: 's',
    subtype: 'mcp_toggle',
  })
  expect(actionRequest('sign-out', 's')).toEqual({ serverName: 's', subtype: 'mcp_clear_auth' })
})

describe('mcpAnswer', () => {
  const answer = (response: object) => JSON.stringify({ response, type: 'control_response' })
  test('reads a success and an error', () => {
    expect(
      mcpAnswer(answer({ request_id: 'mcp-1', response: { a: 1 }, subtype: 'success' }))
    ).toEqual({
      answer: { a: 1 },
      ok: true,
      requestId: 'mcp-1',
    })
    expect(mcpAnswer(answer({ error: 'no', request_id: 'mcp-2', subtype: 'error' }))).toEqual({
      error: 'no',
      ok: false,
      requestId: 'mcp-2',
    })
  })
  test('ignores other answers', () => {
    expect(mcpAnswer(answer({ request_id: 'usage-mcp-1', subtype: 'success' }))).toBeNull()
  })
  test('the line is a control request', () => {
    expect(JSON.parse(mcpLine('mcp-3', { subtype: 'mcp_status' }))).toEqual({
      request: { subtype: 'mcp_status' },
      request_id: 'mcp-3',
      type: 'control_request',
    })
  })
})
