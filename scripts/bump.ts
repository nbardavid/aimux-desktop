// `bun bump patch|minor|major` (or an exact `x.y.z`): sets the version, commits, tags and
// pushes. GitHub Actions then builds, signs and publishes the release apps update from.
import { $ } from 'bun'

/** The version after `current` for `step`, or null when `step` is neither a part nor x.y.z. */
export function nextVersion(current: string, step: string): string | null {
  const [major, minor, patch] = current.split('.').map(Number)
  if (step === 'patch') return `${major}.${minor}.${patch + 1}`
  if (step === 'minor') return `${major}.${minor + 1}.0`
  if (step === 'major') return `${major + 1}.0.0`
  return /^\d+\.\d+\.\d+$/.test(step) ? step : null
}

if (import.meta.main) {
  const pkg = await Bun.file('package.json').json()
  const version = nextVersion(pkg.version, process.argv[2] ?? '')
  if (version === null) throw new Error('usage: bun bump patch|minor|major|<x.y.z>')
  if ((await $`git branch --show-current`.text()).trim() !== 'main') throw new Error('not on main')
  if ((await $`git status --porcelain`.text()).trim() !== '') throw new Error('commit first')

  pkg.version = version
  await Bun.write('package.json', `${JSON.stringify(pkg, null, 2)}\n`)
  await $`git commit -qam ${`release: v${version}`}`
  await $`git tag v${version}`
  await $`git push origin main v${version}`
  await $`echo ${`v${version} pushed: https://github.com/nbardavid/aimux-desktop/actions`}`
}
