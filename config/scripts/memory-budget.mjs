/**
 * Machine-wide memory budget for heavy commands (tsc today; anything else tomorrow).
 *
 * Why: `run-typecheck-projects-in-parallel.mjs` keeps ONE process inside the budget,
 * but on 2026-10-01 three agents verified their own work in the same checkout at the
 * same time. Four `tsc` (18.6 GB) on a 16 GB Mac froze the machine until the power
 * button. Nothing in a single process can see the others; a lease on disk can.
 *
 * A lease is a file in `${tmpdir}/arca-desktop-memory-budget/` naming the holder pid
 * and the GiB it claims. Admission: the sum of live leases plus this claim must fit
 * the static budget (75% of RAM, same as the per-process planner), AND the host must
 * have the claim plus headroom actually free right now. A lease whose pid is gone is
 * garbage and is removed by whoever finds it.
 *
 * CLI: `node config/scripts/memory-budget.mjs <gib> <label> -- <command> [args...]`
 */

import { execFileSync, spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const BYTES_PER_GIB = 1024 ** 3

/** The OS, node itself, and the runner agent need their share; the rest is what heavy work may hold. */
export function admissibleHeapGib(totalBytes) {
  return Math.max(1, (totalBytes / BYTES_PER_GIB) * 0.75)
}

/** Free memory the claim must leave untouched, so the host keeps breathing room. */
export const HEADROOM_GIB = 1
/** A lease older than this is garbage even if its pid is alive (pid reuse). */
export const LEASE_MAX_AGE_MS = 6 * 60 * 60 * 1000
/** Waiting longer than this means the budget is wedged: fail loudly instead of running anyway. */
export const DEFAULT_WAIT_TIMEOUT_MS = 10 * 60 * 1000

export function leaseDir() {
  return path.join(os.tmpdir(), 'arca-desktop-memory-budget')
}

export function isProcessAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return err?.code === 'EPERM'
  }
}

/**
 * Bytes the host can hand out right now, or undefined where the platform cannot say.
 * macOS: `kern.memorystatus_level` is the same number `memory_pressure` prints, and it
 * already accounts for the compressor; `os.freemem()` does not.
 */
export function readHostFreeBytes() {
  try {
    if (process.platform === 'darwin') {
      const out = execFileSync('sysctl', ['-n', 'kern.memorystatus_level'], {
        encoding: 'utf8',
        timeout: 2000,
        stdio: ['ignore', 'pipe', 'ignore']
      })
      const percent = Number.parseInt(out.trim(), 10)
      return Number.isNaN(percent) ? undefined : (percent / 100) * os.totalmem()
    }
    if (process.platform === 'linux') {
      const info = fs.readFileSync('/proc/meminfo', 'utf8')
      const available = /MemAvailable:\s+(\d+)/.exec(info)
      return available ? Number(available[1]) * 1024 : undefined
    }
  } catch {
    /* no reading: only the static budget applies */
  }
  return undefined
}

/** Live leases in `dir`; stale ones (dead pid, too old, unreadable) are deleted on the way. */
export function liveLeases(dir, { isAlive = isProcessAlive, now = Date.now() } = {}) {
  let names
  try {
    names = fs.readdirSync(dir)
  } catch {
    return []
  }
  const live = []
  for (const name of names) {
    const file = path.join(dir, name)
    let lease
    try {
      lease = JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch {
      /* partial or corrupt: garbage below */
    }
    const stale =
      !lease ||
      typeof lease.pid !== 'number' ||
      typeof lease.gib !== 'number' ||
      !isAlive(lease.pid) ||
      now - (lease.createdAt ?? 0) > LEASE_MAX_AGE_MS
    if (stale) {
      try {
        fs.unlinkSync(file)
      } catch {
        /* someone else cleaned it */
      }
      continue
    }
    live.push(lease)
  }
  return live
}

export function claimedGib(leases) {
  return leases.reduce((total, lease) => total + lease.gib, 0)
}

/**
 * Pure admission decision, so the policy is testable without a filesystem.
 * `hostFreeBytes === undefined` means the platform cannot report; only the static budget applies.
 */
export function canAdmit({ gib, claimed, budgetGib, hostFreeBytes, headroomGib = HEADROOM_GIB }) {
  if (claimed + gib > budgetGib) {
    return false
  }
  if (hostFreeBytes === undefined) {
    return true
  }
  return hostFreeBytes >= (gib + headroomGib) * BYTES_PER_GIB
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Waits until `gib` fits, writes the lease, and returns the function that releases it.
 * Throws after `timeoutMs` with the numbers that blocked admission.
 */
export async function acquireMemoryBudget({
  gib,
  label,
  dir = leaseDir(),
  budgetGib = admissibleHeapGib(os.totalmem()),
  hostFreeBytes = readHostFreeBytes,
  isAlive = isProcessAlive,
  now = Date.now,
  pollMs = 1000,
  timeoutMs = DEFAULT_WAIT_TIMEOUT_MS,
  wait = sleep
}) {
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(
    dir,
    `${process.pid}-${now()}-${Math.random().toString(36).slice(2, 8)}.json`
  )
  const startedAt = now()
  let lastReason = ''

  while (true) {
    const leases = liveLeases(dir, { isAlive, now: now() })
    const claimed = claimedGib(leases)
    const free = hostFreeBytes()
    if (canAdmit({ gib, claimed, budgetGib, hostFreeBytes: free })) {
      fs.writeFileSync(file, JSON.stringify({ pid: process.pid, gib, label, createdAt: now() }), {
        flag: 'wx',
        mode: 0o600
      })
      // Between counting and writing another process may have entered. The count
      // after writing decides: whoever overshoots gives the lease back and waits.
      if (claimedGib(liveLeases(dir, { isAlive, now: now() })) > budgetGib) {
        fs.rmSync(file, { force: true })
        await wait(pollMs + Math.floor(Math.random() * pollMs))
        continue
      }
      let released = false
      return () => {
        if (released) {
          return
        }
        released = true
        fs.rmSync(file, { force: true })
      }
    }
    const holders = leases
      .map((lease) => `${lease.label} (${lease.gib} GiB, pid ${lease.pid})`)
      .join(', ')
    const freeText = free === undefined ? 'unknown' : `${(free / BYTES_PER_GIB).toFixed(1)} GiB`
    lastReason = `${label} needs ${gib} GiB; budget ${budgetGib.toFixed(1)} GiB with ${claimed} GiB held${holders ? ` by ${holders}` : ''}; host free ${freeText}`
    if (now() - startedAt >= timeoutMs) {
      throw new Error(
        `memory budget: gave up after ${Math.round(timeoutMs / 60000)} min — ${lastReason}`
      )
    }
    await wait(pollMs)
  }
}

/** Runs `command` under a lease; resolves with its exit code. */
export async function runWithMemoryBudget({ gib, label, command, args, cwd }) {
  const release = await acquireMemoryBudget({ gib, label })
  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(command, args, { cwd, stdio: 'inherit' })
      child.on('error', reject)
      child.on('exit', (code, signal) => resolve(signal ? 1 : (code ?? 1)))
    })
  } finally {
    release()
  }
}

export function parseCliArgs(argv) {
  const separator = argv.indexOf('--')
  if (separator === -1 || argv.length < 2) {
    return null
  }
  const gib = Number(argv[0])
  const label = argv[1]
  const command = argv[separator + 1]
  if (!Number.isFinite(gib) || gib <= 0 || !label || !command) {
    return null
  }
  return { gib, label, command, args: argv.slice(separator + 2) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const parsed = parseCliArgs(process.argv.slice(2))
  if (!parsed) {
    console.error('usage: memory-budget.mjs <gib> <label> -- <command> [args...]')
    process.exit(2)
  }
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  try {
    process.exit(await runWithMemoryBudget({ ...parsed, cwd: repoRoot }))
  } catch (err) {
    console.error(err?.message ?? err)
    process.exit(1)
  }
}
