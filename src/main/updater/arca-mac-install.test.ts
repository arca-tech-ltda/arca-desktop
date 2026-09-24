import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { macInstallScript, verifyUpdateSha512 } from './arca-mac-install'
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
      '/usr/bin/ditto "$staged" "$target"',
      '/usr/bin/xattr -dr com.apple.quarantine "$target"',
      '/usr/bin/open -g "$target"',
      "trap 'rollback' EXIT",
      'mv "$backup" "$target"'
    ]) {
      expect(script).toContain(command)
    }
    expect(script.indexOf('kill -0')).toBeLessThan(script.indexOf('mv "$target"'))
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
