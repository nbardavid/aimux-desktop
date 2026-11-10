import { expect, test } from 'bun:test'

import type { Turn } from './model'

import { recallStep, sentPrompts } from './recall'

const user = (text: string): Turn => ({ blocks: [{ kind: 'text', text }], id: text, role: 'user' })

test('the history is the prompts sent, without repeats in a row or answers', () => {
  const turns: Turn[] = [
    user('a'),
    { blocks: [{ kind: 'text', text: 'reply' }], id: 'r', role: 'assistant' },
    user('b'),
    user('b'),
    { blocks: [{ args: 'opus', kind: 'command', name: 'model' }], id: 'c', role: 'user' },
  ]
  expect(sentPrompts(turns)).toEqual(['a', 'b', '/model opus'])
})

test('↑ walks back to the oldest and holds; ↓ comes back to the new prompt', () => {
  expect(recallStep(3, null, -1)).toBe(2)
  expect(recallStep(3, 0, -1)).toBe(0)
  expect(recallStep(3, 1, 1)).toBe(2)
  expect(recallStep(3, 2, 1)).toBe(null)
  expect(recallStep(3, null, 1)).toBe(null)
  expect(recallStep(0, null, -1)).toBe(null)
})
