// `bun run release 0.2.0`: sets the version, commits, tags and pushes. GitHub Actions then
// builds, signs and publishes the release that installed apps update from.
import { $ } from 'bun'

const version = process.argv[2] ?? ''
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('usage: bun run release <x.y.z>')
if ((await $`git branch --show-current`.text()).trim() !== 'main') throw new Error('not on main')
if ((await $`git status --porcelain`.text()).trim() !== '') throw new Error('commit first')

const pkg = await Bun.file('package.json').json()
pkg.version = version
await Bun.write('package.json', `${JSON.stringify(pkg, null, 2)}\n`)
await $`git commit -qam ${`release: v${version}`}`
await $`git tag v${version}`
await $`git push origin main v${version}`
await $`echo ${`v${version} pushed: https://github.com/nbardavid/aimux-desktop/actions`}`
