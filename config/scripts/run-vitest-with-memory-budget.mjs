/**
 * `pnpm test` entry: a full run claims a machine-wide memory lease; a focused run does not.
 *
 * Why: the full suite (9k files) opens one Vitest worker per core, each a few hundred MB
 * of TS transforms and happy-dom. Two agents running it at once in the same checkout is
 * the same shape of incident as the four parallel `tsc` that froze the machine
 * (see memory-budget.mjs). A run with file filters is small and must stay instant.
 */

import { spawn } from 'node:child_process'
import { availableParallelism } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { acquireMemoryBudget } from './memory-budget.mjs'

/** Rough per-worker peak for this suite; measured ceiling will replace it when we have one. */
export const GIB_PER_WORKER = 0.6
export const FULL_RUN_MIN_GIB = 2

/** A filter, or any arg that is not a flag, narrows the run: no lease needed. */
export function isFocusedRun(args) {
  return args.some((arg) => !arg.startsWith('-'))
}

export function fullRunGib(parallelism = availableParallelism()) {
  return Math.max(FULL_RUN_MIN_GIB, Math.ceil(parallelism * GIB_PER_WORKER))
}

function runVitest(args, cwd) {
  return new Promise((resolve, reject) => {
    const vitest = fileURLToPath(new URL('../../node_modules/vitest/vitest.mjs', import.meta.url))
    const child = spawn(
      process.execPath,
      [vitest, 'run', '--config', 'config/vitest.config.ts', ...args],
      {
        cwd,
        stdio: 'inherit'
      }
    )
    child.on('error', reject)
    child.on('exit', (code, signal) => resolve(signal ? 1 : (code ?? 1)))
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2)
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  try {
    if (isFocusedRun(args)) {
      process.exit(await runVitest(args, repoRoot))
    }
    const release = await acquireMemoryBudget({ gib: fullRunGib(), label: 'vitest full' })
    try {
      process.exit(await runVitest(args, repoRoot))
    } finally {
      release()
    }
  } catch (err) {
    console.error(err?.message ?? err)
    process.exit(1)
  }
}
