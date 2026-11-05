import { expect, test } from 'bun:test'

import { type HostChat, hostDecision, type HostTerm, wouldLose } from './use-host'

const chat = (o: Partial<HostChat>): HostChat => ({
  alive: true,
  historyLen: 0,
  id: 'c',
  unread: false,
  waiting: false,
  working: false,
  ...o,
})
const term = (o: Partial<HostTerm>): HostTerm => ({
  code: null,
  command: null,
  cwd: '/',
  ended: false,
  id: 't',
  tag: null,
  title: 'T',
  workspaceId: 'w',
  ...o,
})

test('same protocol attaches', () => {
  expect(
    hostDecision({ list: { chats: [chat({ working: true })], terms: [] }, protocolOk: true })
  ).toBe('attach')
})

test('old host with nothing at stake restarts silently', () => {
  expect(
    hostDecision({
      list: { chats: [chat({})], terms: [term({ ended: true })] },
      protocolOk: false,
    })
  ).toBe('restart')
})

test('old host with a working chat blocks', () => {
  expect(
    hostDecision({ list: { chats: [chat({ working: true })], terms: [] }, protocolOk: false })
  ).toBe('blocked')
})

test('old host with a live terminal blocks', () => {
  expect(wouldLose({ chats: [], terms: [term({})] })).toEqual({ chats: 0, terms: 1 })
})

test('a stopped chat is not lost', () => {
  expect(wouldLose({ chats: [chat({ alive: false, waiting: true })], terms: [] })).toEqual({
    chats: 0,
    terms: 0,
  })
})
