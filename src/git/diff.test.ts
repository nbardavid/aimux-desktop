import { expect, test } from 'bun:test'

import { parseUnifiedDiff } from './diff'

const RAW = `diff --git a/x.ts b/x.ts
index 1..2 100644
--- a/x.ts
+++ b/x.ts
@@ -10,3 +10,3 @@ function f
 keep
-old
+new
\\ No newline at end of file
`

test('numbers lines from the hunk header and drops file headers', () => {
  expect(parseUnifiedDiff(RAW)).toEqual([
    { kind: 'hunk', text: '@@ -10,3 +10,3 @@ function f' },
    { a: 10, b: 10, kind: 'ctx', text: 'keep' },
    { a: 11, kind: 'del', text: 'old' },
    { b: 11, kind: 'add', text: 'new' },
  ])
})

test('a new file counts from 1', () => {
  const raw = '--- /dev/null\n+++ b/n.sh\n@@ -0,0 +1,2 @@\n+a\n+b\n'
  expect(parseUnifiedDiff(raw).filter((l) => l.kind === 'add')).toEqual([
    { b: 1, kind: 'add', text: 'a' },
    { b: 2, kind: 'add', text: 'b' },
  ])
})
