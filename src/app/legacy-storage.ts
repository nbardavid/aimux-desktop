// The previous app (aimux desktop) kept its window settings in localStorage under `aimux.*`.
// The first launch under this name copies each one to its `logit.*` key, unless that key is
// already set, so drafts, the sidebar and the layout carry over. The old keys stay as they are.

const OLD = 'aimux.'
const NEW = 'logit.'

/** Copies every `aimux.*` key to its `logit.*` twin that is missing. Storage may be refused. */
export function migrateLegacyStorage(storage?: Storage): void {
  try {
    const store = storage ?? localStorage
    const old: string[] = []
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i)
      if (key !== null && key.startsWith(OLD)) old.push(key)
    }
    for (const key of old) {
      try {
        const target = NEW + key.slice(OLD.length)
        const value = store.getItem(key)
        if (value !== null && store.getItem(target) === null) store.setItem(target, value)
      } catch {
        // One key that cannot be copied leaves the others to be.
      }
    }
  } catch {
    // No storage at all: the app starts with its defaults.
  }
}
