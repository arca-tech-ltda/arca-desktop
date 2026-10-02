import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  acquireMemoryBudget,
  canAdmit,
  claimedGib,
  liveLeases,
  parseCliArgs
} from './memory-budget.mjs'

const GIB = 1024 ** 3

function leaseDirFixture() {
  return mkdtempSync(join(tmpdir(), 'memory-budget-'))
}

function writeLease(dir, name, lease) {
  writeFileSync(join(dir, name), JSON.stringify({ createdAt: Date.now(), label: 'x', ...lease }))
}

describe('memory budget admission', () => {
  it('refuses a claim that overshoots the static budget', () => {
    expect(canAdmit({ gib: 5, claimed: 8, budgetGib: 12, hostFreeBytes: undefined })).toBe(false)
    expect(canAdmit({ gib: 4, claimed: 8, budgetGib: 12, hostFreeBytes: undefined })).toBe(true)
  })

  it('refuses a claim the host cannot back right now, even inside the static budget', () => {
    // Why: leases describe intent; the host number describes Chrome, Docker and everything else.
    expect(canAdmit({ gib: 5, claimed: 0, budgetGib: 12, hostFreeBytes: 5.5 * GIB })).toBe(false)
    expect(canAdmit({ gib: 5, claimed: 0, budgetGib: 12, hostFreeBytes: 6 * GIB })).toBe(true)
  })

  it('counts only leases whose holder is alive and drops the rest', () => {
    const dir = leaseDirFixture()
    writeLease(dir, 'alive.json', { pid: process.pid, gib: 5 })
    writeLease(dir, 'dead.json', { pid: 999999, gib: 8 })
    writeFileSync(join(dir, 'corrupt.json'), '{nope')
    const leases = liveLeases(dir, { isAlive: (pid) => pid === process.pid })
    expect(claimedGib(leases)).toBe(5)
    expect(readdirSync(dir)).toEqual(['alive.json'])
  })

  it('waits for another holder to release before running', async () => {
    const dir = leaseDirFixture()
    writeLease(dir, 'other.json', { pid: 4242, gib: 8 })
    const alive = new Set([process.pid, 4242])
    const waits = []
    const wait = async () => {
      waits.push(1)
      // The other holder leaves on the second poll.
      if (waits.length === 2) {
        alive.delete(4242)
      }
    }
    const release = await acquireMemoryBudget({
      gib: 5,
      label: 'tsc-web',
      dir,
      budgetGib: 12,
      hostFreeBytes: () => undefined,
      isAlive: (pid) => alive.has(pid),
      wait,
      pollMs: 1
    })
    expect(waits.length).toBeGreaterThanOrEqual(2)
    expect(readdirSync(dir)).toHaveLength(1)
    release()
    expect(readdirSync(dir)).toHaveLength(0)
  })

  it('fails loudly after the wait timeout instead of running anyway', async () => {
    const dir = leaseDirFixture()
    writeLease(dir, 'other.json', { pid: 4242, gib: 8 })
    let clock = 0
    await expect(
      acquireMemoryBudget({
        gib: 8,
        label: 'tsc-node',
        dir,
        budgetGib: 12,
        hostFreeBytes: () => undefined,
        isAlive: () => true,
        now: () => clock,
        wait: async () => {
          clock += 1000
        },
        pollMs: 1,
        timeoutMs: 3000
      })
    ).rejects.toThrow(/tsc-node needs 8 GiB; budget 12.0 GiB with 8 GiB held by x/)
    expect(readdirSync(dir)).toEqual(['other.json'])
  })

  it('parses the CLI shape and rejects malformed calls', () => {
    expect(parseCliArgs(['5', 'tsc-web', '--', 'node', 'tsc', '-p', 'x'])).toEqual({
      gib: 5,
      label: 'tsc-web',
      command: 'node',
      args: ['tsc', '-p', 'x']
    })
    expect(parseCliArgs(['nope', 'tsc-web', '--', 'node'])).toBeNull()
    expect(parseCliArgs(['5', 'tsc-web', 'node'])).toBeNull()
  })
})
