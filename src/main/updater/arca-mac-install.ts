import { createHash, timingSafeEqual } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, lstat, mkdtemp, readdir, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { runProcess, spawnProcess } from '../../shared/child-process/run-process'

export async function verifyUpdateSha512(path: string, expected: string): Promise<void> {
  if (!/^[A-Za-z0-9+/]{86}==$/.test(expected)) {
    throw new Error('Invalid update SHA512')
  }
  const hash = createHash('sha512')
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk)
  }
  const actual = hash.digest()
  const wanted = Buffer.from(expected, 'base64')
  if (wanted.length !== actual.length || !timingSafeEqual(actual, wanted)) {
    throw new Error('Update SHA512 mismatch')
  }
}

const quote = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`

export function macInstallScript(pid: number, target: string, staged: string): string {
  if (!Number.isSafeInteger(pid) || pid <= 0 || !target.endsWith('.app')) {
    throw new Error('Invalid macOS install target')
  }
  return `#!/bin/sh
set -eu
target=${quote(target)}
staged=${quote(staged)}
backup="$target.bak"
# Abort rather than replace an app that refused to quit.
count=0
while kill -0 ${pid} 2>/dev/null; do
  count=$((count + 1))
  [ "$count" -lt 120 ] || exit 1
  sleep 1
done
[ -d "$target" ] && [ ! -L "$target" ] && [ -w "$target" ] || exit 1
[ ! -L "$backup" ] || exit 1
rm -rf "$backup"
mv "$target" "$backup"
rollback() {
  rm -rf "$target"
  mv "$backup" "$target"
  /usr/bin/open -g "$target"
}
trap 'rollback' EXIT
/usr/bin/ditto "$staged" "$target"
/usr/bin/xattr -dr com.apple.quarantine "$target"
/usr/bin/open -g "$target"
trap - EXIT
`
}

export async function writableMacTarget(execPath: string): Promise<string> {
  const target = dirname(dirname(dirname(execPath)))
  if (!target.endsWith('.app') || (await lstat(target)).isSymbolicLink()) {
    throw new Error('Invalid installed app bundle')
  }
  await access(target, constants.W_OK)
  await access(dirname(target), constants.W_OK)
  return target
}

export async function extractMacUpdate(zip: string, directory: string): Promise<string> {
  const destination = join(directory, 'extracted')
  const result = await runProcess({
    program: '/usr/bin/ditto',
    args: ['-x', '-k', zip, destination],
    timeoutMs: 120_000
  })
  if (result.code !== 0) {
    throw new Error('Could not extract update')
  }
  const apps = (await readdir(destination)).filter((name) => name.endsWith('.app'))
  if (apps.length !== 1) {
    throw new Error('Update must contain exactly one app')
  }
  const staged = join(destination, apps[0])
  if (!(await lstat(staged)).isDirectory()) {
    throw new Error('Invalid update bundle')
  }
  await access(join(staged, 'Contents', 'Info.plist'))
  return staged
}

export async function launchMacInstaller(target: string, staged: string): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'arca-install-'))
  const script = join(directory, 'install.sh')
  await writeFile(script, macInstallScript(process.pid, target, staged), { mode: 0o700 })
  const child = spawnProcess({
    program: '/bin/sh',
    args: [script],
    detached: true,
    stdio: 'ignore'
  })
  await new Promise<void>((resolve, reject) => {
    child.once('spawn', resolve)
    child.once('error', reject)
  })
  child.unref()
}
