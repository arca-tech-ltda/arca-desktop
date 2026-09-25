import { homedir } from 'node:os'
import { join } from 'node:path'
import type {
  PiAccountAddResult,
  PiAccountProvider,
  PiAccountRemoveResult,
  PiAccountRenameResult,
  PiAccountsState
} from '../../shared/pi-accounts'
import { withAuthLock } from './auth-lock'
import {
  authSchema,
  bucketSchema,
  readJson,
  writeJson,
  type Auth,
  type Bucket,
  type Credential
} from './files'
import { createAccountMirror, type MirrorResult } from './mirror'
import { PiAccountEditor } from './pi-account-editor'

const providers = ['anthropic', 'openai-codex'] as const

const transientCodes = new Set(['EPERM', 'EBUSY', 'ENOENT', 'EACCES', 'EAGAIN'])

function isTransientFileError(error: unknown): boolean {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
  return typeof code === 'string' && transientCodes.has(code)
}

function saveFirst(provider: string): Error {
  return new Error(`Save the current slot first: /accounts save ${provider} <name>`)
}

// Match /accounts: capture refreshed slots into their accounts, but never across identities.
function captureSlots(
  bucket: Bucket,
  auth: Auth,
  options: { strict?: boolean; exclude?: string } = {}
): void {
  for (const [activeProvider, activeName] of Object.entries(bucket.active)) {
    if (activeProvider === options.exclude) {
      continue
    }
    const slot = auth[activeProvider]
    const stored = bucket.accounts[activeProvider]?.[activeName]
    if (!slot || !stored) {
      continue
    }
    if (slot.accountId && stored.accountId && slot.accountId !== stored.accountId) {
      if (options.strict) {
        throw saveFirst(activeProvider)
      }
      continue
    }
    bucket.accounts[activeProvider][activeName] = slot
  }
}

export class PiAccountsService {
  private readonly agentDir: string
  private readonly editor: PiAccountEditor
  private pending: Promise<unknown> = Promise.resolve()
  private cancelPendingLogin: (() => boolean) | null = null
  private loginUrl: string | null = null
  private readonly loginUrlListeners = new Set<(url: string | null) => void>()

  constructor(
    private readonly options: {
      agentDir?: string
      mirror?: ReturnType<typeof createAccountMirror>
      mirrorEnabled?: boolean
      editor?: PiAccountEditor
    } = {}
  ) {
    this.agentDir =
      options.agentDir ?? process.env.PI_CODING_AGENT_DIR ?? join(homedir(), '.pi', 'agent')
    this.editor = options.editor ?? new PiAccountEditor(this.agentDir)
  }

  private get bucketPath(): string {
    return join(this.agentDir, 'accounts.json')
  }

  private get authPath(): string {
    return join(this.agentDir, 'auth.json')
  }

  private async read(): Promise<{ bucket: Bucket; auth: Auth }> {
    const bucket = bucketSchema.parse(
      await readJson(this.bucketPath, { version: 1, active: {}, accounts: {} })
    )
    const auth = authSchema.parse(await readJson(this.authPath, {}))
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
    return this.enqueue(() => this.switchAccount(provider, name))
  }

  /** Re-pushes the active Pi credential to the CLI sources (after something else overwrote them). */
  remirror(provider: PiAccountProvider): Promise<PiAccountsState> {
    return this.enqueue(() => this.remirrorActive(provider))
  }

  /** Signs in through the provider's own CLI and saves the result as a named Pi account. */
  async add(provider: PiAccountProvider): Promise<PiAccountAddResult> {
    // Why outside the queue: the login waits on a browser for minutes, and every other account
    // action would queue behind it. The bucket write it ends with takes the auth lock.
    this.abandonPendingLogin()
    const outcome = await this.editor.add(provider, {
      setCancel: (cancel) => {
        this.cancelPendingLogin = cancel
      },
      onAuthUrl: (url) => this.publishLoginUrl(url)
    })
    this.cancelPendingLogin = null
    this.publishLoginUrl(null)
    return { ...outcome, state: await this.list() }
  }

  /** Abandons the sign-in waiting on a browser, if any. True when one was stopped. */
  abandonPendingLogin(): boolean {
    return this.cancelPendingLogin?.() ?? false
  }

  onLoginUrlChanged(listener: (url: string | null) => void): () => void {
    this.loginUrlListeners.add(listener)
    return () => this.loginUrlListeners.delete(listener)
  }

  private publishLoginUrl(url: string | null): void {
    if (this.loginUrl === url) {
      return
    }
    this.loginUrl = url
    for (const listener of this.loginUrlListeners) {
      listener(url)
    }
  }

  async remove(provider: PiAccountProvider, name: string): Promise<PiAccountRemoveResult> {
    const status = await this.enqueue(() => this.editor.remove(provider, name))
    return { status, state: await this.list() }
  }

  async rename(
    provider: PiAccountProvider,
    from: string,
    to: string
  ): Promise<PiAccountRenameResult> {
    const status = await this.enqueue(() => this.editor.rename(provider, from, to))
    return { status, state: await this.list() }
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.pending.then(operation)
    this.pending = next.catch(() => {})
    return next
  }

  private async runMirror(
    provider: PiAccountProvider,
    name: string,
    cred: Credential
  ): Promise<MirrorResult> {
    if (!(this.options.mirrorEnabled ?? process.env.PI_ACCOUNTS_MIRROR !== '0')) {
      return { cred }
    }
    try {
      return await (this.options.mirror ?? createAccountMirror())(
        provider,
        `${provider}/${name}`,
        cred,
        join(this.agentDir, 'accounts-mirror.json')
      )
    } catch {
      return { cred, error: 'mirror-failed' }
    }
  }

  private async switchAccount(provider: PiAccountProvider, name: string): Promise<PiAccountsState> {
    const { bucket, auth } = await this.read()
    if (!Object.hasOwn(bucket.accounts[provider] ?? {}, name)) {
      throw new Error('Pi account not found')
    }
    if (auth[provider] && !bucket.active[provider]) {
      throw saveFirst(provider)
    }
    captureSlots(bucket, auth, { strict: true })
    const previousName = bucket.active[provider]
    const before = JSON.stringify(auth[provider] ?? null)
    bucket.active[provider] = name
    const mirrored = await this.runMirror(provider, name, bucket.accounts[provider][name])
    bucket.accounts[provider][name] = mirrored.cred
    // Why the lock and the re-read: mirroring does network and Keychain work, and Pi can refresh
    // the same slot meanwhile. Only the switched provider's slot is ours to replace.
    await withAuthLock(this.agentDir, async () => {
      const fresh = authSchema.parse(await readJson(this.authPath, {}))
      if (JSON.stringify(fresh[provider] ?? null) !== before) {
        if (previousName) {
          bucket.active[provider] = previousName
        } else {
          delete bucket.active[provider]
        }
        // Keep both the refresh Pi just made and the one the mirror rotated; the switch is aborted.
        captureSlots(bucket, fresh)
        await writeJson(this.bucketPath, bucket)
        throw new Error('Pi refreshed this provider while switching; try again')
      }
      captureSlots(bucket, fresh, { exclude: provider })
      await writeJson(this.bucketPath, bucket)
      await writeJson(this.authPath, { ...fresh, [provider]: bucket.accounts[provider][name] })
    })
    return { ...(await this.list()), ...(mirrored.error ? { error: mirrored.error } : {}) }
  }

  private async remirrorActive(provider: PiAccountProvider): Promise<PiAccountsState> {
    const { bucket, auth } = await this.read()
    const name = bucket.active[provider]
    const cred = name ? bucket.accounts[provider]?.[name] : undefined
    if (!name || !cred) {
      return this.list()
    }
    const before = JSON.stringify(auth[provider] ?? null)
    const mirrored = await this.runMirror(provider, name, cred)
    const rotated = JSON.stringify(mirrored.cred) !== JSON.stringify(cred)
    if (rotated || before !== JSON.stringify(cred)) {
      await withAuthLock(this.agentDir, async () => {
        const fresh = authSchema.parse(await readJson(this.authPath, {}))
        bucket.accounts[provider][name] = mirrored.cred
        captureSlots(bucket, fresh, { exclude: provider })
        await writeJson(this.bucketPath, bucket)
        // A rotation invalidates whatever else landed in the slot, so it wins; otherwise Pi's newer slot stays.
        if (rotated || JSON.stringify(fresh[provider] ?? null) === before) {
          await writeJson(this.authPath, { ...fresh, [provider]: mirrored.cred })
        }
      })
    }
    return { ...(await this.list()), ...(mirrored.error ? { error: mirrored.error } : {}) }
  }

  watch(onChange: (state: PiAccountsState) => void, intervalMs = 1000): () => void {
    let stopped = false
    let previous = ''
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async (): Promise<void> => {
      let state: PiAccountsState | null
      try {
        state = await this.list()
      } catch (error) {
        // A half-written or briefly locked file is not a change; keep the last published state.
        state = isTransientFileError(error) ? null : { accounts: [], error: 'read-failed' }
      }
      const serialized = state ? JSON.stringify(state) : previous
      if (!stopped && state && serialized !== previous) {
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
