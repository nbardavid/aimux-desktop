import { IPC_PROTOCOL_MIN_VERSION, IPC_PROTOCOL_VERSION } from '@aimux/ipc'
import { expect, test } from 'bun:test'

import { createDaemonClient, type DaemonLink } from './client'

function fakeLink() {
  const sent: { id: string; payload: unknown; type: string }[] = []
  let message: (json: string) => void = () => {}
  let close: (reason: string) => void = () => {}
  const link: DaemonLink = {
    onClose: (cb) => {
      close = cb
    },
    onMessage: (cb) => {
      message = cb
    },
    send: async (json) => {
      sent.push(JSON.parse(json))
    },
  }
  return {
    close: (reason: string) => close(reason),
    deliver: (value: unknown) => message(JSON.stringify(value)),
    link,
    sent,
  }
}

function counter() {
  let n = 0
  return () => `t-${++n}`
}

test('resolves responses by id, out of order', async () => {
  const fake = fakeLink()
  const client = createDaemonClient(fake.link, counter())
  const first = client.request('ping', {})
  const second = client.request('ping', {})
  fake.deliver({ id: 't-2', payload: { activeTabId: null, tabs: [] }, type: 'listTabsResult' })
  fake.deliver({ id: 't-1', payload: {}, type: 'ok' })
  expect((await first).type).toBe('ok')
  expect((await second).type).toBe('listTabsResult')
})

test('rejects on error response', async () => {
  const fake = fakeLink()
  const client = createDaemonClient(fake.link, counter())
  const pending = client.request('ping', {})
  fake.deliver({ id: 't-1', payload: { message: 'boom' }, type: 'error' })
  expect(await pending.catch((error: Error) => error.message)).toBe('boom')
})

test('delivers events to listeners and unsubscribes', () => {
  const fake = fakeLink()
  const client = createDaemonClient(fake.link, counter())
  const seen: string[] = []
  const unsubscribe = client.onEvent((event) => seen.push(event.type))
  const exit = { payload: { exitCode: 0, tabId: 'a' }, type: 'tabExit' }
  fake.deliver(exit)
  unsubscribe()
  fake.deliver(exit)
  expect(seen).toEqual(['tabExit'])
})

test('rejects pending requests on close', async () => {
  const fake = fakeLink()
  const client = createDaemonClient(fake.link, counter())
  const reasons: string[] = []
  client.onClose((reason) => reasons.push(reason))
  const pending = client.request('ping', {})
  fake.close('eof')
  expect(await pending.catch((error: Error) => error.message)).toBe('daemon disconnected')
  expect(reasons).toEqual(['eof'])
})

test('ignores malformed messages', async () => {
  const fake = fakeLink()
  const client = createDaemonClient(fake.link, counter())
  const pending = client.request('ping', {})
  expect(() => fake.deliver({ type: 'nope' })).not.toThrow()
  fake.deliver({ id: 't-1', payload: {}, type: 'ok' })
  expect((await pending).type).toBe('ok')
})

test('hello sends supported range', async () => {
  const fake = fakeLink()
  const client = createDaemonClient(fake.link, counter())
  const pending = client.hello()
  expect(fake.sent[0]).toEqual({
    id: 't-1',
    payload: { maxVersion: IPC_PROTOCOL_VERSION, minVersion: IPC_PROTOCOL_MIN_VERSION },
    type: 'hello',
  })
  const result = {
    capabilities: [],
    maxVersion: IPC_PROTOCOL_VERSION,
    minVersion: IPC_PROTOCOL_MIN_VERSION,
    processVersion: '1',
    selectedVersion: IPC_PROTOCOL_VERSION,
  }
  fake.deliver({ id: 't-1', payload: result, type: 'helloResult' })
  expect((await pending).selectedVersion).toBe(IPC_PROTOCOL_VERSION)
})
