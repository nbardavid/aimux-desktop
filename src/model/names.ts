const WORDS = [
  'amber',
  'aspen',
  'basil',
  'birch',
  'cedar',
  'clover',
  'coral',
  'delta',
  'ember',
  'fern',
  'flint',
  'garnet',
  'hazel',
  'iris',
  'jade',
  'juniper',
  'lark',
  'linden',
  'maple',
  'marble',
  'moss',
  'nova',
  'oak',
  'olive',
  'onyx',
  'opal',
  'pine',
  'quartz',
  'raven',
  'reed',
  'rowan',
  'sage',
  'slate',
  'sorrel',
  'spruce',
  'thistle',
  'tide',
  'umber',
  'willow',
  'wren',
  'yarrow',
  'zephyr',
]

/** A workspace name: lowercase words and digits joined by dashes, as a branch can carry it. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
}

/** A short name no workspace of the project uses yet, so one click is enough to create one. */
export function suggestName(taken: readonly string[], pick = Math.random): string {
  const used = new Set(taken.map(slugify))
  const free = WORDS.filter((w) => !used.has(w))
  if (free.length > 0) return free[Math.floor(pick() * free.length)] ?? 'workspace'
  for (let n = 2; ; n++) {
    const name = `${WORDS[Math.floor(pick() * WORDS.length)] ?? 'workspace'}-${n}`
    if (!used.has(name)) return name
  }
}
