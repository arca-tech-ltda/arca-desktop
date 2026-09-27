import { join } from 'node:path'
import type { PiAccountProvider } from '../../shared/pi-accounts'
import { withBucketLock } from './auth-lock'
import {
  findDuplicatePiAccount,
  insertPiAccount,
  removePiAccount,
  renamePiAccount,
  type PiAccountRemovalOutcome,
  type PiAccountRenameOutcome
} from './bucket-account-edits'
import { rememberCodexIdToken } from './codex-id-token-cache'
import { bucketSchema, readJson, writeJson, type Bucket } from './files'
import {
  getPiLoginRunner,
  isPiLoginCancellation,
  type PiLoginHooks,
  type PiLoginRunner
} from './pi-account-login'

export type PiAccountAddOutcome = {
  status: 'added' | 'duplicate' | 'cancelled' | 'failed'
  name?: string
}

/**
 * Writes named accounts into the Pi bucket the way `/accounts` does, so both sides keep reading
 * the same file. Only `accounts.json` is touched; the live `auth.json` slot stays Pi's.
 */
export class PiAccountEditor {
  constructor(
    private readonly agentDir: string,
    private readonly loginRunner: (provider: PiAccountProvider) => PiLoginRunner = getPiLoginRunner
  ) {}

  private get bucketPath(): string {
    return join(this.agentDir, 'accounts.json')
  }

  private async mutate<T>(change: (bucket: Bucket) => T): Promise<T> {
    return withBucketLock(this.agentDir, async () => {
      const bucket = bucketSchema.parse(
        await readJson(this.bucketPath, {
          version: 1,
          active: {},
          accounts: {}
        })
      )
      const before = JSON.stringify(bucket)
      const result = change(bucket)
      if (JSON.stringify(bucket) !== before) {
        await writeJson(this.bucketPath, bucket)
      }
      return result
    })
  }

  async add(provider: PiAccountProvider, hooks: PiLoginHooks): Promise<PiAccountAddOutcome> {
    let captured
    try {
      captured = await this.loginRunner(provider)(hooks)
    } catch (error) {
      if (isPiLoginCancellation(error)) {
        return { status: 'cancelled' }
      }
      // Never forwarded to the renderer: CLI failure output can quote a credential.
      console.warn('[pi-accounts] Sign-in failed:', error)
      return { status: 'failed' }
    }
    const saved = await this.mutate((bucket) => {
      const duplicate = findDuplicatePiAccount(bucket, captured, captured.suggestedName)
      if (duplicate) {
        return { status: 'duplicate' as const, name: duplicate }
      }
      insertPiAccount(bucket, provider, captured.suggestedName, captured.cred)
      return { status: 'added' as const, name: captured.suggestedName }
    })
    if (saved.status === 'added' && captured.codexIdToken) {
      // The Codex mirror rebuilds ~/.codex/auth.json from this cache; without it the first
      // mirror does a refresh round trip just to recover the id token.
      await rememberCodexIdToken(
        join(this.agentDir, 'accounts-mirror.json'),
        `${provider}/${saved.name}`,
        captured.codexIdToken
      ).catch((error: unknown) =>
        console.warn('[pi-accounts] Could not cache the Codex id token:', error)
      )
    }
    return saved
  }

  remove(provider: PiAccountProvider, name: string): Promise<PiAccountRemovalOutcome> {
    return this.mutate((bucket) => removePiAccount(bucket, provider, name))
  }

  rename(provider: PiAccountProvider, from: string, to: string): Promise<PiAccountRenameOutcome> {
    return this.mutate((bucket) => renamePiAccount(bucket, provider, from, to))
  }
}
