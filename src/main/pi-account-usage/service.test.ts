import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ProviderRateLimits } from '../../shared/rate-limit-types'
import { PiAccountUsageHistory } from './pi-account-usage-history'
import type { PiAccountCredential } from './pi-account-credentials'

const fetchPiAccountUsage =
  vi.fn<(credential: PiAccountCredential) => Promise<ProviderRateLimits>>()
vi.mock('./pi-account-usage-fetch', () => ({
  fetchPiAccountUsage: (credential: PiAccountCredential) => fetchPiAccountUsage(credential)
}))

const { PiAccountUsageService } = await import('./service')

const homes: string[] = []
afterEach(async () => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })))
})

function okLimits(usedPercent: number): ProviderRateLimits {
  return {
    provider: 'claude',
    session: { usedPercent, windowMinutes: 300, resetsAt: null, resetDescription: null },
    weekly: null,
    updatedAt: Date.now(),
    error: null,
    status: 'ok'
  }
}

async function fixture(accounts: Record<string, Record<string, unknown>>) {
  const home = await mkdtemp(join(tmpdir(), 'pi-account-usage-'))
  homes.push(home)
  await writeFile(
    join(home, 'accounts.json'),
    JSON.stringify({ version: 1, active: {}, accounts }),
    'utf8'
  )
  vi.stubEnv('PI_CODING_AGENT_DIR', home)
  const history = new PiAccountUsageHistory(() => join(home, 'history.json'))
  return { home, service: new PiAccountUsageService({ history }), history }
}

const liveCredential = { type: 'oauth', access: 'live-token', expires: Date.now() + 3_600_000 }
const expiredCredential = { type: 'oauth', access: 'old-token', expires: Date.now() - 1_000 }

it('reads usage once per account and serves the cache inside the TTL', async () => {
  fetchPiAccountUsage.mockResolvedValue(okLimits(40))
  const { service } = await fixture({ anthropic: { work: liveCredential } })

  await service.setWatching(true)
  await service.whenSettled()
  const state = await service.list()
  expect(fetchPiAccountUsage).toHaveBeenCalledTimes(1)
  expect(state.accounts[0]).toMatchObject({ name: 'work', status: 'ok' })
  expect(state.accounts[0].rateLimits?.session?.usedPercent).toBe(40)

  await service.setWatching(true)
  await service.whenSettled()
  expect(fetchPiAccountUsage).toHaveBeenCalledTimes(1)
  service.dispose()
})

it('never renews an expired token and reports no data for it', async () => {
  fetchPiAccountUsage.mockResolvedValue(okLimits(10))
  const { service } = await fixture({
    anthropic: { stale: expiredCredential },
    'openai-codex': { fresh: liveCredential }
  })

  await service.setWatching(true)
  await service.whenSettled()
  const state = await service.list()
  expect(fetchPiAccountUsage).toHaveBeenCalledTimes(1)
  expect(fetchPiAccountUsage.mock.calls[0][0].name).toBe('fresh')
  expect(state.accounts.find((account) => account.name === 'stale')).toMatchObject({
    status: 'noToken',
    rateLimits: null,
    updatedAt: null
  })
  service.dispose()
})

it('does not touch the provider APIs without a watcher', async () => {
  fetchPiAccountUsage.mockResolvedValue(okLimits(10))
  const { service } = await fixture({ anthropic: { work: liveCredential } })

  const state = await service.list()
  expect(state.accounts).toHaveLength(1)
  expect(fetchPiAccountUsage).not.toHaveBeenCalled()

  await service.setWatching(true)
  await service.whenSettled()
  await service.setWatching(false)
  fetchPiAccountUsage.mockClear()
  await service.list()
  expect(fetchPiAccountUsage).not.toHaveBeenCalled()
  service.dispose()
})

it('samples each successful read into the local history', async () => {
  fetchPiAccountUsage.mockResolvedValue(okLimits(55))
  const { service } = await fixture({ anthropic: { work: liveCredential } })

  await service.setWatching(true)
  await service.whenSettled()
  const history = await service.getHistory('anthropic', 'work')
  expect(history.samples).toHaveLength(1)
  expect(history.samples[0][1]).toBe(55)
  service.dispose()
})
