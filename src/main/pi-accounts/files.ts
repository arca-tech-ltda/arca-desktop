import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { setTimeout } from 'node:timers/promises'
import { z } from 'zod'

export const credentialSchema = z
  .object({
    type: z.string().optional(),
    access: z.string().optional(),
    refresh: z.string().optional(),
    expires: z.number().optional(),
    accountId: z.string().optional()
  })
  .passthrough()
export type Credential = z.infer<typeof credentialSchema>
export const authSchema = z.record(z.string(), credentialSchema)
export type Auth = z.infer<typeof authSchema>
export const bucketSchema = z
  .object({
    version: z.literal(1),
    active: z.record(z.string(), z.string()),
    accounts: z.record(z.string(), z.record(z.string(), credentialSchema))
  })
  .passthrough()
export type Bucket = z.infer<typeof bucketSchema>

export async function readJson(path: string, fallback: unknown): Promise<unknown> {
  try {
    return JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/u, ''))
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return fallback
    }
    throw error
  }
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = `${path}.tmp-${randomUUID()}`
  try {
    await writeFile(temporary, JSON.stringify(value, null, 2), { mode: 0o600, flag: 'wx' })
    for (let attempt = 0; ; attempt++) {
      try {
        await rename(temporary, path)
        break
      } catch (error) {
        const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
        if (attempt >= 4 || (code !== 'EPERM' && code !== 'EBUSY')) {
          throw error
        }
        await setTimeout(25 * (attempt + 1))
      }
    }
  } finally {
    await unlink(temporary).catch(() => {})
  }
}
