import type * as fsPromises from 'node:fs/promises'
import { symlink, lchmod } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

// A root-owned link made under umask 077 makes readlink itself fail with EACCES for the user.
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof fsPromises>()
  return {
    ...actual,
    readlink: vi.fn(async (path: string) => {
      if (path.endsWith('unreadable-arca')) {
        throw Object.assign(new Error(`EACCES: permission denied, readlink '${path}'`), {
          code: 'EACCES'
        })
      }
      return actual.readlink(path)
    })
  }
})

const { CliInstaller } = await import('./cli-installer')
const { createPackagedMacLauncher, makeFixture } = await import('./cli-installer-test-fixtures')

describe.skipIf(process.platform !== 'darwin')('CLI command inspection on macOS', () => {
  it('reports an unreadable arca link as stale instead of throwing', async () => {
    const fixture = await makeFixture()
    const root = fixture.root
    const resourcesPath = await createPackagedMacLauncher(root)
    const commandPath = join(root, 'unreadable-arca')
    await symlink(join(resourcesPath, 'bin', 'arca'), commandPath)
    await lchmod(commandPath, 0o700)

    const installer = new CliInstaller({
      platform: 'darwin',
      isPackaged: true,
      resourcesPath,
      userDataPath: fixture.userDataPath,
      execPath: '/Applications/ARCA.app/Contents/MacOS/ARCA',
      appPath: fixture.appPath,
      homePath: join(root, 'home'),
      defaultMacCommandPath: commandPath,
      processPathEnv: root
    })

    await expect(installer.getStatus()).resolves.toMatchObject({
      commandPath,
      state: 'stale',
      detail: `${commandPath} is not readable by this user. Register again to repair it.`
    })
  })
})
