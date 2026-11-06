// `bun bump patch|minor|major` (or an exact `x.y.z`): sets the version, builds and signs the
// app on this Mac, then commits, tags, pushes and publishes the GitHub release apps update
// from. A failed build leaves nothing behind but the edited package.json, restored.
import { $ } from 'bun'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

const REPO = 'nbardavid/aimux-desktop'
/** The asset name installed apps download; kept from the old CI releases. */
const ARCHIVE = 'aimux_aarch64.app.tar.gz'

/** The version after `current` for `step`, or null when `step` is neither a part nor x.y.z. */
export function nextVersion(current: string, step: string): string | null {
  const [major, minor, patch] = current.split('.').map(Number)
  if (step === 'patch') return `${major}.${minor}.${patch + 1}`
  if (step === 'minor') return `${major}.${minor + 1}.0`
  if (step === 'major') return `${major + 1}.0.0`
  return /^\d+\.\d+\.\d+$/.test(step) ? step : null
}

/** The `latest.json` the updater reads, in the shape tauri-action used to publish. */
export function updateManifest(version: string, signature: string, pubDate: string) {
  const url = `https://github.com/${REPO}/releases/download/v${version}/${ARCHIVE}`
  const target = { signature, url }
  return {
    notes: '',
    platforms: { 'darwin-aarch64': target, 'darwin-aarch64-app': target },
    pub_date: pubDate,
    version,
  }
}

if (import.meta.main) {
  const pkg = await Bun.file('package.json').json()
  const version = nextVersion(pkg.version, process.argv[2] ?? '')
  if (version === null) throw new Error('usage: bun bump patch|minor|major|<x.y.z>')
  if (process.arch !== 'arm64') throw new Error('releases are built on Apple silicon only')
  if ((await $`git branch --show-current`.text()).trim() !== 'main') throw new Error('not on main')
  if ((await $`git status --porcelain`.text()).trim() !== '') throw new Error('commit first')
  await $`gh auth status`.quiet()

  pkg.version = version
  await Bun.write('package.json', `${JSON.stringify(pkg, null, 2)}\n`)
  try {
    await $`bun run build`.env({
      ...process.env,
      TAURI_SIGNING_PRIVATE_KEY:
        process.env.TAURI_SIGNING_PRIVATE_KEY ?? join(homedir(), '.tauri/aimux-desktop.key'),
      TAURI_SIGNING_PRIVATE_KEY_PASSWORD: process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? '',
    })
  } catch (error) {
    await $`git checkout package.json`
    throw error
  }

  const bundle = 'src-tauri/target/release/bundle/macos'
  const out = join(tmpdir(), `aimux-release-${version}`)
  await $`rm -rf ${out} && mkdir -p ${out}`
  await $`cp ${bundle}/aimux.app.tar.gz ${join(out, ARCHIVE)}`
  const signature = (await Bun.file(`${bundle}/aimux.app.tar.gz.sig`).text()).trim()
  const manifest = updateManifest(version, signature, new Date().toISOString())
  await Bun.write(join(out, 'latest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

  await $`git commit -qam ${`release: v${version}`}`
  await $`git tag v${version}`
  await $`git push origin main v${version}`
  const assets = [join(out, ARCHIVE), join(out, 'latest.json')]
  await $`gh release create v${version} -R ${REPO} --title ${`aimux v${version}`} --notes '' ${assets}`
  await $`echo ${`v${version} published: https://github.com/${REPO}/releases/tag/v${version}`}`
}
