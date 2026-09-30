import { readlinkSync } from 'node:fs'
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
      if (path.endsWith('failing-arca')) {
        throw Object.assign(new Error(`EIO: i/o error, readlink '${path}'`), { code: 'EIO' })
      }
      return actual.readlink(path)
    })
  }
})

const { CliInstaller } = await import('./cli-installer')
const { createPackagedMacLauncher, makeFixture } = await import('./cli-installer-test-fixtures')

async function makeMacInstaller(commandName: string): Promise<{
  installer: InstanceType<typeof CliInstaller>
  commandPath: string
  launcherPath: string
}> {
  const fixture = await makeFixture()
  const resourcesPath = await createPackagedMacLauncher(fixture.root)
  const launcherPath = join(resourcesPath, 'bin', 'arca')
  const commandPath = join(fixture.root, commandName)
  await symlink(launcherPath, commandPath)
  await lchmod(commandPath, 0o700)

  return {
    installer: new CliInstaller({
      platform: 'darwin',
      isPackaged: true,
      resourcesPath,
      userDataPath: fixture.userDataPath,
      execPath: '/Applications/ARCA.app/Contents/MacOS/ARCA',
      appPath: fixture.appPath,
      homePath: join(fixture.root, 'home'),
      defaultMacCommandPath: commandPath,
      processPathEnv: fixture.root
    }),
    commandPath,
    launcherPath
  }
}

describe.skipIf(process.platform !== 'darwin')('CLI command inspection on macOS', () => {
  it('reports an unreadable link as a conflict instead of throwing', async () => {
    const { installer, commandPath } = await makeMacInstaller('unreadable-arca')

    await expect(installer.getStatus()).resolves.toMatchObject({
      commandPath,
      state: 'conflict',
      currentTarget: null,
      detail: `${commandPath} is a symlink this user cannot read, so ARCA cannot verify what it points to. Fix its permissions or remove it, then register again.`
    })
  })

  it('refuses to replace or remove an unreadable link and leaves it untouched', async () => {
    const { installer, commandPath, launcherPath } = await makeMacInstaller('unreadable-arca')

    await expect(installer.install()).rejects.toThrow(
      `Refusing to replace non-ARCA command at ${commandPath}`
    )
    await expect(installer.remove()).rejects.toThrow(
      `Refusing to remove non-ARCA command at ${commandPath}`
    )
    expect(readlinkSync(commandPath)).toBe(launcherPath)
  })

  it('propagates a non-permission readlink failure instead of guessing a state', async () => {
    const { installer } = await makeMacInstaller('failing-arca')

    await expect(installer.getStatus()).rejects.toMatchObject({ code: 'EIO' })
  })

  it('still reports a readable but privately moded ARCA link as repairable', async () => {
    const { installer, commandPath, launcherPath } = await makeMacInstaller('arca')

    await expect(installer.getStatus()).resolves.toMatchObject({
      commandPath,
      state: 'stale',
      currentTarget: launcherPath,
      detail: `${commandPath} is not readable by this user. Register again to repair it.`
    })
  })
})
