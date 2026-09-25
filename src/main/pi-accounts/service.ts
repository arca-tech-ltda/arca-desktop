import { homedir } from 'node:os'
import { join } from 'node:path'
import type { PiAccountProvider, PiAccountsState } from '../../shared/pi-accounts'
import { authSchema, bucketSchema, readJson, writeJson } from './files'
import { createAccountMirror } from './mirror'

const providers = ['anthropic', 'openai-codex'] as const

export class PiAccountsService {
  private readonly agentDir: string
  private pending: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly options: {
      agentDir?: string
      mirror?: ReturnType<typeof createAccountMirror>
      mirrorEnabled?: boolean
    } = {}
  ) {
    this.agentDir =
      options.agentDir ?? process.env.PI_CODING_AGENT_DIR ?? join(homedir(), '.pi', 'agent')
  }

  private async read() {
    const bucket = bucketSchema.parse(
      await readJson(join(this.agentDir, 'accounts.json'), { version: 1, active: {}, accounts: {} })
    )
    const auth = authSchema.parse(await readJson(join(this.agentDir, 'auth.json'), {}))
    return { bucket, auth }
  }

  async list(): Promise<PiAccountsState> {
    const { bucket, auth } = await this.read()
    return {
      accounts: providers.flatMap((provider) =>
        Object.keys(bucket.accounts[provider] ?? {})
          .sort()
          .map((name) => ({
            provider,
            name,
            active: bucket.active[provider] === name,
            drift:
              bucket.active[provider] === name &&
              JSON.stringify(auth[provider]) !== JSON.stringify(bucket.accounts[provider][name])
          }))
      )
    }
  }

  use(provider: PiAccountProvider, name: string): Promise<PiAccountsState> {
    const operation = this.pending.then(() => this.switchAccount(provider, name))
    this.pending = operation.catch(() => {})
    return operation
  }

  private async switchAccount(provider: PiAccountProvider, name: string): Promise<PiAccountsState> {
    const { bucket, auth } = await this.read()
    if (!Object.hasOwn(bucket.accounts[provider] ?? {}, name)) {
      throw new Error('Pi account not found')
    }
    if (auth[provider] && !bucket.active[provider]) {
      throw new Error(`Save the current slot first: /accounts save ${provider} <name>`)
    }
    // Match /accounts: capture refreshed slots before switching, but never overwrite a different identity.
    for (const [activeProvider, activeName] of Object.entries(bucket.active)) {
      const slot = auth[activeProvider]
      const stored = bucket.accounts[activeProvider]?.[activeName]
      if (!slot || !stored) {
        continue
      }
      if (slot.accountId && stored.accountId && slot.accountId !== stored.accountId) {
        throw new Error(`Save the current slot first: /accounts save ${activeProvider} <name>`)
      }
      bucket.accounts[activeProvider][activeName] = slot
    }
    auth[provider] = bucket.accounts[provider][name]
    bucket.active[provider] = name
    let error: string | undefined
    if (this.options.mirrorEnabled ?? process.env.PI_ACCOUNTS_MIRROR !== '0') {
      try {
        const next = await (this.options.mirror ?? createAccountMirror())(
          provider,
          `${provider}/${name}`,
          auth[provider],
          join(this.agentDir, 'accounts-mirror.json')
        )
        bucket.accounts[provider][name] = next
        auth[provider] = next
      } catch {
        error = 'mirror-failed'
      }
    }
    await writeJson(join(this.agentDir, 'accounts.json'), bucket)
    await writeJson(join(this.agentDir, 'auth.json'), auth)
    return { ...(await this.list()), ...(error ? { error } : {}) }
  }

  watch(onChange: (state: PiAccountsState) => void, intervalMs = 1000): () => void {
    let stopped = false
    let previous = ''
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async (): Promise<void> => {
      let state: PiAccountsState
      try {
        state = await this.list()
      } catch {
        state = { accounts: [], error: 'read-failed' }
      }
      const serialized = JSON.stringify(state)
      if (!stopped && serialized !== previous) {
        previous = serialized
        onChange(state)
      }
      if (!stopped) {
        timer = setTimeout(() => void poll(), intervalMs)
        timer.unref()
      }
    }
    void poll()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }
}
