import { expect, test } from 'bun:test'

import { migrateLegacyStorage } from './legacy-storage'

function memory(init: Record<string, string>): Storage {
  const data = new Map(Object.entries(init))
  return {
    clear: () => data.clear(),
    getItem: (k: string) => data.get(k) ?? null,
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size
    },
    removeItem: (k: string) => void data.delete(k),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
  } as Storage
}

function dump(s: Storage): Record<string, string | null> {
  const out: Record<string, string | null> = {}
  for (let i = 0; i < s.length; i++) {
    const key = s.key(i) ?? ''
    out[key] = s.getItem(key)
  }
  return out
}

test('each aimux key is copied to its logit twin, and the old one stays', () => {
  const s = memory({ 'aimux.chat.drafts': '{"a":1}', 'aimux.layout': '{"w":2}', 'other': 'x' })
  migrateLegacyStorage(s)
  expect(dump(s)).toEqual({
    'aimux.chat.drafts': '{"a":1}',
    'aimux.layout': '{"w":2}',
    'logit.chat.drafts': '{"a":1}',
    'logit.layout': '{"w":2}',
    'other': 'x',
  })
})

test('a logit key already set is kept, and running twice changes nothing', () => {
  const s = memory({ 'aimux.layout': 'old', 'logit.layout': 'new' })
  migrateLegacyStorage(s)
  migrateLegacyStorage(s)
  expect(s.getItem('logit.layout')).toBe('new')
  expect(s.length).toBe(2)
})

test('storage that throws does not throw out of the migration', () => {
  const broken = {
    get length(): number {
      throw new Error('blocked')
    },
  } as unknown as Storage
  expect(() => migrateLegacyStorage(broken)).not.toThrow()
})
