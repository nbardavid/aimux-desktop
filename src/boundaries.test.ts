import { parseServerMessage } from '@aimux/ipc'
import { expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const FORBIDDEN = /from ['"][^'"]*src\/(state|app-runtime|ui|input)\//

test('desktop never imports TUI internals', () => {
  const root = import.meta.dir
  const offenders = readdirSync(root, { encoding: 'utf8', recursive: true })
    .filter((file) => /\.tsx?$/.test(file))
    .flatMap((file) =>
      readFileSync(join(root, file), 'utf8')
        .split('\n')
        .filter((line) => FORBIDDEN.test(line))
        .map((line) => `${file}: ${line}`)
    )
  expect(offenders).toEqual([])
})

test('protocol is importable', () => {
  expect(typeof parseServerMessage).toBe('function')
})
