import { lstat, readdir } from 'node:fs/promises'
import path from 'node:path'
import { gitExecFileAsync } from '../git/runner'
import { normalizeArcaRemote } from './catalog'

export async function scanArcaDisk(home: string): Promise<{ repoKey: string; path: string }[]> {
  const result: { repoKey: string; path: string }[] = []
  async function visit(directory: string, depth: number): Promise<void> {
    try {
      const info = await lstat(directory)
      if (!info.isDirectory() || info.isSymbolicLink()) {
        return
      }
      const entries = await readdir(directory, { withFileTypes: true })
      if (entries.some((entry) => entry.name === '.git')) {
        try {
          const { stdout } = await gitExecFileAsync(['config', '--get', 'remote.origin.url'], {
            cwd: directory,
            timeout: 10_000
          })
          const repoKey = normalizeArcaRemote(stdout)
          if (repoKey) {
            result.push({ repoKey, path: directory })
          }
        } catch {
          /* Repositories without origin cannot be matched. */
        }
      }
      if (depth > 0) {
        for (const entry of entries) {
          if (entry.isDirectory() && !entry.name.startsWith('.')) {
            await visit(path.join(directory, entry.name), depth - 1)
          }
        }
      }
    } catch (error) {
      if (
        typeof error !== 'object' ||
        error === null ||
        !('code' in error) ||
        error.code !== 'ENOENT'
      ) {
        throw error
      }
    }
  }
  for (const section of ['clientes', 'plataforma', 'produtos']) {
    await visit(path.join(home, 'ARCA', section), 2)
  }
  await visit(path.join(home, 'ARCA', 'arca'), 0)
  return result
}
