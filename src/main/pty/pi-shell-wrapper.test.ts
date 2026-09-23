import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { runProcess } from '../../shared/child-process/run-process'
import {
  withPiManagedExtensions,
  PI_EXTENSION_ENV_KEYS
} from '../../shared/tui-agent-pi-extensions'
import { getFishPiShellWrapper, getPosixPiShellWrapper } from './pi-shell-wrapper'

const roots: string[] = []
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

for (const shell of ['/bin/bash', '/bin/zsh', '/opt/homebrew/bin/fish']) {
  it.skipIf(!existsSync(shell))(`preserves extension paths and argv in ${shell}`, async () => {
    const root = mkdtempSync(join(tmpdir(), 'arca pi '))
    roots.push(root)
    writeFileSync(join(root, 'pi'), '#!/bin/sh\nprintf "%s\\n" "$@"\n', { mode: 0o755 })
    const paths = PI_EXTENSION_ENV_KEYS.map((key) => join(root, `${key} Leo Silva \\ $quote'.ts`))
    paths.forEach((path) => writeFileSync(path, ''))
    const env = {
      ...process.env,
      PATH: root + delimiter + process.env.PATH,
      ORCA_PANE_KEY: 'pane',
      ...Object.fromEntries(PI_EXTENSION_ENV_KEYS.map((key, i) => [key, paths[i]]))
    }
    for (const manual of [true, false]) {
      const wrapper = shell.endsWith('fish') ? getFishPiShellWrapper() : getPosixPiShellWrapper()
      const command = manual
        ? `${wrapper}\npi 'hello world'`
        : withPiManagedExtensions("pi 'hello world'", 'posix')
      const result = await runProcess({ program: shell, args: ['-c', command], env })
      expect(result.code, result.stderr).toBe(0)
      expect(result.stdout.trim().split('\n')).toEqual([
        ...paths.flatMap((path) => ['--extension', path]),
        'hello world'
      ])
      const outside = await runProcess({
        program: shell,
        args: ['-c', command],
        env: { ...env, ORCA_PANE_KEY: '' }
      })
      expect(outside.stdout).toBe('hello world\n')
    }
  })
}

it.skipIf(!existsSync('/opt/homebrew/bin/pwsh'))(
  'passes literal paths through PowerShell explicit and manual launches',
  async () => {
    const { getPowerShellPiShellWrapper } = await import('./pi-shell-wrapper')
    const root = mkdtempSync(join(tmpdir(), 'arca pi pwsh '))
    roots.push(root)
    writeFileSync(join(root, 'pi'), '#!/bin/sh\nprintf "%s\\n" "$@"\n', { mode: 0o755 })
    const paths = PI_EXTENSION_ENV_KEYS.map((key) => join(root, `${key} Leo Silva.ts`))
    paths.forEach((path) => writeFileSync(path, ''))
    const env = {
      ...process.env,
      PATH: root + delimiter + process.env.PATH,
      ORCA_PANE_KEY: 'pane',
      ...Object.fromEntries(PI_EXTENSION_ENV_KEYS.map((key, i) => [key, paths[i]]))
    }
    for (const command of [
      withPiManagedExtensions("pi 'hello world'", 'powershell'),
      `${getPowerShellPiShellWrapper()}\npi 'hello world'`
    ]) {
      const result = await runProcess({
        program: '/opt/homebrew/bin/pwsh',
        args: ['-NoProfile', '-NonInteractive', '-Command', command],
        env
      })
      expect(result.code, result.stderr).toBe(0)
      expect(result.stdout.trim().split('\n')).toEqual([
        ...paths.flatMap((path) => ['--extension', path]),
        'hello world'
      ])
    }
  }
)
