import { createHash, randomBytes } from 'node:crypto'
import { hostname } from 'node:os'
import type { MegamindStatus } from '../../shared/arca-megamind'
import { readCredential, saveCredential, safeMegamindUrl } from './credentials'
import { callTool, megamindJson, type Fetch } from './gateway'

export class MegamindEnrollment {
  status: MegamindStatus = { state: 'disconnected' }
  private timer?: ReturnType<typeof setTimeout>
  private starting?: Promise<MegamindStatus>
  private stopped = false

  constructor(
    private readonly options: {
      path: string
      endpoint: string
      development: boolean
      changed: (status: MegamindStatus) => void
      fetcher?: Fetch
      now?: () => number
    }
  ) {}

  private publish(status: MegamindStatus): MegamindStatus {
    this.status = status
    this.options.changed(status)
    return status
  }

  async restore(): Promise<boolean> {
    try {
      const credential = await readCredential(this.options.path, this.options.development)
      await callTool(this.options.fetcher ?? fetch, credential, 'list_agents', {})
      if (this.stopped) {
        return false
      }
      this.publish({ state: 'connected', device: `${hostname()} ARCA Desktop` })
      return true
    } catch {
      return false
    }
  }

  start(): Promise<MegamindStatus> {
    if (this.starting) {
      return this.starting
    }
    if (this.status.state === 'pending') {
      return Promise.resolve(this.status)
    }
    this.starting = this.begin().finally(() => {
      this.starting = undefined
    })
    return this.starting
  }

  private async begin(): Promise<MegamindStatus> {
    if (await this.restore()) {
      return this.status
    }
    try {
      const endpoint = safeMegamindUrl(this.options.endpoint, this.options.development)
      const token = randomBytes(32).toString('base64url')
      const fetcher = this.options.fetcher ?? fetch
      const started = await megamindJson(
        fetcher,
        new URL('/api/arca/devices/enrollments', endpoint).href,
        {
          label: `${hostname()} ARCA Desktop`,
          credential_hash: createHash('sha256').update(token).digest('hex')
        }
      )
      if (
        typeof started.enrollment_id !== 'string' ||
        !/^[a-z0-9]{15}$/.test(started.enrollment_id) ||
        typeof started.user_code !== 'string' ||
        typeof started.verification_uri !== 'string'
      ) {
        throw new Error('Invalid enrollment')
      }
      const verification = new URL(started.verification_uri)
      if (
        verification.origin !== endpoint.origin ||
        verification.username ||
        verification.password
      ) {
        throw new Error('Invalid verification origin')
      }
      const interval =
        Math.max(5, Number(started.poll_interval_seconds ?? started.interval ?? 5)) * 1000
      const now = this.options.now ?? Date.now
      const expires =
        typeof started.expires_at === 'string'
          ? Date.parse(started.expires_at)
          : now() + Number(started.expires_in) * 1000
      if (!Number.isFinite(interval) || !Number.isFinite(expires) || expires <= now()) {
        throw new Error('Invalid enrollment expiry')
      }
      this.publish({
        state: 'pending',
        userCode: started.user_code,
        verificationUri: verification.href
      })
      const poll = async (): Promise<void> => {
        if (this.stopped) {
          return
        }
        if (now() >= expires) {
          this.publish({ state: 'expired' })
          return
        }
        try {
          const result = await megamindJson(
            fetcher,
            new URL(`/api/arca/devices/enrollments/${started.enrollment_id}/poll`, endpoint).href,
            {},
            token
          )
          if (this.stopped) {
            return
          }
          if (result.status === 'approved') {
            if (await this.restore()) {
              return
            }
            if (this.stopped) {
              return
            }
            await saveCredential(this.options.path, endpoint.href, token)
            if (this.stopped) {
              return
            }
            this.publish({ state: 'connected', device: `${hostname()} ARCA Desktop` })
            return
          }
          if (result.status === 'expired' || result.status === 'denied') {
            this.publish({ state: result.status === 'expired' ? 'expired' : 'error' })
            return
          }
          if (result.status !== 'pending') {
            throw new Error('Invalid poll status')
          }
        } catch {
          if (now() >= expires) {
            this.publish({ state: 'expired' })
            return
          }
          this.publish({ state: 'error' })
          return
        }
        this.timer = setTimeout(() => void poll(), interval)
        this.timer.unref()
      }
      this.timer = setTimeout(() => void poll(), interval)
      this.timer.unref()
      return this.status
    } catch {
      return this.publish({ state: 'error' })
    }
  }

  connectionChanged(connected: boolean): void {
    if (this.status.state === 'pending') {
      return
    }
    const state = connected ? 'connected' : 'error'
    if (this.status.state !== state) {
      this.publish({ state, device: this.status.device })
    }
  }

  stop(): void {
    this.stopped = true
    clearTimeout(this.timer)
  }
}
