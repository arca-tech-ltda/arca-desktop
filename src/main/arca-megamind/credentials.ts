import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, isAbsolute } from 'node:path'
import { parseArcaMainframeBaseUrl } from '../../shared/arca-mainframe'

export function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function safeMegamindUrl(raw: string, development = false): URL {
  const url = new URL(raw)
  if (
    !parseArcaMainframeBaseUrl(raw, { allowInsecureLoopback: development }) ||
    url.search ||
    url.hash
  ) {
    throw new Error('Invalid Megamind URL')
  }
  return url
}

export const megamindConfigPath = (): string =>
  process.env.ARCA_MEGAMIND_CONFIG || join(homedir(), '.config', 'arca-projects', 'config.json')

export type DeviceCredential = { endpoint: string; token: string; tokenFile: string }

export async function readCredential(path: string, development = false): Promise<DeviceCredential> {
  const config: unknown = JSON.parse(await readFile(path, 'utf8'))
  if (
    !object(config) ||
    typeof config.endpoint !== 'string' ||
    typeof config.token_file !== 'string' ||
    !isAbsolute(config.token_file)
  ) {
    throw new Error('Invalid Megamind configuration')
  }
  safeMegamindUrl(config.endpoint, development)
  const info = await lstat(config.token_file)
  if (!info.isFile() || (process.platform !== 'win32' && (info.mode & 0o077) !== 0)) {
    throw new Error('Unsafe Megamind credential permissions')
  }
  const token = (await readFile(config.token_file, 'utf8')).trim()
  if (!token) {
    throw new Error('Empty Megamind credential')
  }
  return { endpoint: config.endpoint, tokenFile: config.token_file, token }
}

export async function saveCredential(path: string, endpoint: string, token: string): Promise<void> {
  // Exclusive creation preserves Pi credentials, including ones written during enrollment.
  const tokenFile = join(dirname(path), 'token')
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  try {
    await lstat(path)
    throw new Error('Megamind configuration already exists')
  } catch (error) {
    if (!object(error) || error.code !== 'ENOENT') {
      throw error
    }
  }
  await writeFile(tokenFile, `${token}\n`, { flag: 'wx', mode: 0o600 })
  await writeFile(path, `${JSON.stringify({ endpoint, token_file: tokenFile }, null, 2)}\n`, {
    flag: 'wx',
    mode: 0o600
  })
}
