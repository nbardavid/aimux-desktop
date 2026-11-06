import { expect, test } from 'bun:test'

import { ageLabel, workspaceFacts } from './sidebar'

const MIN = 60_000
const now = 1_000 * MIN * 60 * 24

test('ages read now, then minutes, hours, days, weeks', () => {
  expect(ageLabel(now - 30_000, now)).toBe('now')
  expect(ageLabel(now - 4 * MIN, now)).toBe('4m')
  expect(ageLabel(now - 59 * MIN, now)).toBe('59m')
  expect(ageLabel(now - 3 * 60 * MIN, now)).toBe('3h')
  expect(ageLabel(now - 2 * 24 * 60 * MIN, now)).toBe('2d')
  expect(ageLabel(now - 6 * 24 * 60 * MIN, now)).toBe('6d')
  expect(ageLabel(now - 5 * 7 * 24 * 60 * MIN, now)).toBe('5w')
  // A clock that went back still says "now".
  expect(ageLabel(now + MIN, now)).toBe('now')
})

const ws = { createdAt: 100, id: 'w' }
const chat = (title: string, createdAt: number, activeAt?: number, workspaceId = 'w') => ({
  activeAt,
  createdAt,
  title,
  workspaceId,
})

test('the task is the first chat named after its work, skipping "New chat"', () => {
  const chats = [
    chat('Fix the resume order', 300),
    chat('New chat', 200),
    chat('Port the menus', 250),
    chat('Elsewhere', 50, undefined, 'x'),
  ]
  expect(workspaceFacts(ws, chats).task).toBe('Port the menus')
  expect(workspaceFacts(ws, [chat('New chat', 200)]).task).toBeNull()
  expect(workspaceFacts(ws, []).task).toBeNull()
})

test('the age is the latest turn of its chats, else when it was made', () => {
  expect(workspaceFacts(ws, []).activeAt).toBe(100)
  expect(workspaceFacts(ws, [chat('a', 150, 900), chat('b', 200, 0)]).activeAt).toBe(900)
  // Older records carry no activeAt: the chat's creation stands in.
  expect(workspaceFacts(ws, [chat('a', 400)]).activeAt).toBe(400)
  expect(workspaceFacts(ws, [chat('a', 50, 5000, 'x')]).activeAt).toBe(100)
})
