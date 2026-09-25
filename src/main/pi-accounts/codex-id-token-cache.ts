import { z } from 'zod'
import { readJson, writeJson } from './files'

// Shared with arca/extensions/lib/account-mirror.ts: Pi's own mirror reads the same cache file.
const cacheSchema = z.object({
  version: z.literal(1),
  codexIdTokens: z.record(z.string(), z.string())
})

export async function readCodexIdToken(
  statePath: string,
  key: string
): Promise<string | undefined> {
  const state = cacheSchema.parse(await readJson(statePath, { version: 1, codexIdTokens: {} }))
  return state.codexIdTokens[key]
}

export async function rememberCodexIdToken(
  statePath: string,
  key: string,
  idToken: string
): Promise<void> {
  const state = cacheSchema.parse(await readJson(statePath, { version: 1, codexIdTokens: {} }))
  state.codexIdTokens[key] = idToken
  await writeJson(statePath, state)
}
