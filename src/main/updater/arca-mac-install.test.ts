import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile, mkdir, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  macInstallScript,
  verifyUpdateSha512,
  removeHealthyMacUpdateBackup
} from './arca-mac-install'
import { runProcess } from '../../shared/child-process/run-process'

describe('unsigned macOS update', () => {
  it('accepts exact SHA512 bytes and rejects tampering or malformed hashes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'arca-hash-test-'))
    try {
      const file = join(dir, 'update.zip')
      await writeFile(file, 'archive bytes')
      const digest = createHash('sha512').update('archive bytes').digest('base64')
      await expect(verifyUpdateSha512(file, digest)).resolves.toBeUndefined()
      await expect(verifyUpdateSha512(file, 'invalid')).rejects.toThrow('SHA512')
      await writeFile(file, 'tampered')
      await expect(verifyUpdateSha512(file, digest)).rejects.toThrow('SHA512')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('quotes paths, waits, backs up, replaces, removes quarantine and rolls back', () => {
    const script = macInstallScript(123, "/Applications/ARCA's app.app", '/tmp/staged ARCA.app')
    expect(script).toContain("target='/Applications/ARCA'\\''s app.app'")
    for (const command of [
      'kill -0 123',
      '[ "$count" -lt 120 ]',
      '[ ! -L "$backup" ]',
      'mv "$target" "$backup"',
      '/usr/bin/ditto "$staged" "$replacement"',
      '/usr/bin/xattr -dr com.apple.quarantine "$replacement"',
      '/usr/bin/open -g "$target"',
      "trap 'rollback' EXIT",
      "trap 'exit 1' INT TERM HUP",
      'trap - EXIT INT TERM HUP',
      'mv "$backup" "$target"'
    ]) {
      expect(script).toContain(command)
    }
    expect(script.indexOf('kill -0')).toBeLessThan(script.indexOf('mv "$target"'))
    expect(script.indexOf('/usr/bin/ditto')).toBeLessThan(script.indexOf('mv "$target"'))
    expect(script.indexOf("trap 'rollback'")).toBeLessThan(script.indexOf('mv "$target"'))
    expect(script).not.toContain('sudo')
    expect(() => macInstallScript(0, '/Applications/ARCA.app', '/tmp/x')).toThrow()
  })

  it.skipIf(process.platform === 'win32')(
    'parses the script without executing replacement',
    async () => {
      const result = await runProcess({
        program: '/bin/sh',
        args: ['-n'],
        input: macInstallScript(123, '/Applications/ARCA.app', '/tmp/ARCA.app')
      })
      expect(result.code).toBe(0)
    }
  )
})

it('preserves the isolated profile and hidden launch across an E2E restart', () => {
  const script = macInstallScript(
    123,
    '/tmp/ARCA.app',
    '/tmp/staged/ARCA.app',
    ['--user-data-dir=/tmp/arca-e2e/ud', '--remote-debugging-port=9339'],
    true
  )
  expect(script).toContain("'--user-data-dir=/tmp/arca-e2e/ud'")
  expect(script).toContain("'--remote-debugging-port=9339'")
  expect(script).not.toContain('/usr/bin/open')
  expect(script).toContain('"$target/Contents/MacOS/ARCA"')
})

it('removes only a bundle backup on healthy startup, including legacy installers', async () => {
  const root = await mkdtemp(join(tmpdir(), 'arca-backup-'))
  const target = join(root, 'ARCA.app')
  const backup = `${target}.bak`
  try {
    await mkdir(target)
    await mkdir(backup)
    const exec = join(target, 'Contents', 'MacOS', 'ARCA')
    await removeHealthyMacUpdateBackup(exec)
    await expect(access(backup)).resolves.toBeUndefined()
    await mkdir(join(backup, 'Contents'))
    await writeFile(join(backup, 'Contents', 'Info.plist'), '<plist/>')
    await removeHealthyMacUpdateBackup(exec)
    await expect(access(backup)).rejects.toThrow()
    await expect(access(target)).resolves.toBeUndefined()
    await removeHealthyMacUpdateBackup(exec)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

it.skipIf(process.platform === 'win32').each(['INT', 'TERM', 'HUP'])(
  'restores the bundle on SIG%s during replacement',
  async (signal) => {
    const root = await mkdtemp(join(tmpdir(), 'arca-rollback-'))
    const target = join(root, 'ARCA.app')
    try {
      await mkdir(target)
      await writeFile(join(target, 'original'), 'old bundle')
      const script = macInstallScript(123, target, '/unused')
        .replace('while kill -0 123 2>/dev/null', 'while false')
        .replace('/usr/bin/ditto "$staged" "$replacement"', ':')
        .replace('/usr/bin/xattr -dr com.apple.quarantine "$replacement"', ':')
        .replace('mv "$target" "$backup"', `mv "$target" "$backup"\nkill -${signal} $$`)
        .replaceAll('/usr/bin/open -g "$target"', ':')
      const result = await runProcess({ program: '/bin/sh', args: [], input: script })
      expect(result.code).not.toBe(0)
      await expect(access(join(target, 'original'))).resolves.toBeUndefined()
      await expect(access(`${target}.bak`)).rejects.toThrow()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }
)
