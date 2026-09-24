import { access } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { isCommandOnPath } from '../ipc/preflight-command-exec'
import type { MegamindPrerequisites } from '../../shared/arca-megamind'

export async function megamindPrerequisites(): Promise<MegamindPrerequisites> {
  const exists = async (path: string): Promise<boolean> =>
    access(path).then(
      () => true,
      () => false
    )
  const windows = process.platform === 'win32'
  return {
    pi: await isCommandOnPath('pi'),
    installer: await exists(
      join(homedir(), 'ARCA', 'arca', windows ? 'install.ps1' : 'install.sh')
    ),
    extension: await exists(join(homedir(), '.pi', 'agent', 'extensions', 'arca-megamind')),
    windows
  }
}
