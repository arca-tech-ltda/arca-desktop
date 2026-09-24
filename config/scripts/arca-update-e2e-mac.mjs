import { createReadStream } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { mkdir, readdir, access } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// This script publishes only with explicit consent; never touches the stable channel.
const publish = process.argv.includes('--publish')
if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  throw new Error('Run on macOS arm64')
}
const root = fileURLToPath(new URL('../..', import.meta.url))
const work = '/tmp/arca-e2e'
const target = join(work, 'Applications', 'ARCA.app')
try {
  await access(target)
  throw new Error(`Move the existing ${target} before running again`)
} catch (error) {
  if (error.code !== 'ENOENT') {
    throw error
  }
}
const base = new URL(process.env.ARCA_MAINFRAME_URL ?? 'https://mainframe.arcatech.com.br')
if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) {
  throw new Error('Use an HTTPS Mainframe origin')
}
const feed = new URL('/api/arca/desktop/updates/e2e/', base).href
const token = process.env.ARCA_DESKTOP_PUBLISH_TOKEN
if (publish && !token) {
  throw new Error('ARCA_DESKTOP_PUBLISH_TOKEN required with --publish')
}
const env = { ...process.env, ORCA_BACKGROUND_LAUNCH: '1', CSC_IDENTITY_AUTO_DISCOVERY: 'false' }
for (const key of ['ORCA_MAC_RELEASE', 'ORCA_MAC_HOURLY', 'ORCA_MAC_DAILY', 'ORCA_MAC_ADHOC']) {
  delete env[key]
}
function run(program, args, extra = {}) {
  execFileSync(program, args, { cwd: root, env: { ...env, ...extra }, stdio: 'inherit' })
}
run('pnpm', ['build:desktop'])
run('node', ['config/scripts/ensure-native-runtime.mjs', '--runtime=electron'])
for (const version of ['1.5.900', '1.5.901']) {
  run(
    'pnpm',
    [
      'exec',
      'electron-builder',
      '--config',
      'config/electron-builder.config.cjs',
      '--mac',
      'zip',
      '--arm64',
      '--publish',
      'never',
      `--config.directories.output=${join(work, version)}`,
      '--config.mac.identity=null',
      '--config.publish.provider=generic',
      `--config.publish.url=${feed}`
    ],
    { ARCA_RELEASE_VERSION: version }
  )
}
const newer = join(work, '1.5.901')
const files = await readdir(newer)
const manifest = 'latest-mac.yml'
await access(join(newer, manifest))
if (publish) {
  for (const name of [...files.filter((f) => /\.(zip|blockmap)$/.test(f)), manifest]) {
    const response = await fetch(new URL(name, feed), {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
      body: createReadStream(join(newer, name)),
      duplex: 'half',
      redirect: 'error'
    })
    if (!response.ok) {
      throw new Error(`PUT ${name}: HTTP ${response.status}`)
    }
  }
} else {
  console.log('Not published. Run with --publish and ARCA_DESKTOP_PUBLISH_TOKEN to publish e2e.')
}
await mkdir(resolve(target, '..'), { recursive: true })
run('/usr/bin/ditto', [
  '-x',
  '-k',
  join(work, '1.5.900', 'arca-macos-1.5.900-arm64.zip'),
  resolve(target, '..')
])
console.log(
  `Launch (requires a device enrolled at ${base.origin}):\nORCA_BACKGROUND_LAUNCH=1 ARCA_UPDATE_CHANNEL=e2e ARCA_MAINFRAME_URL=${base.origin} '${target}/Contents/MacOS/ARCA' --user-data-dir=/tmp/arca-e2e/ud --remote-debugging-port=9339`
)
console.log(
  'Use Playwright CDP at http://127.0.0.1:9339; keep the renderer hidden. Click update-download, observe progress, then update-restart. Reconnect and verify getVersion() returns 1.5.901. No ZIP request should occur before the download click.'
)
