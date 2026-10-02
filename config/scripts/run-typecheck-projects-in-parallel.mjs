import { spawn } from 'node:child_process'
import { availableParallelism, totalmem } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { acquireMemoryBudget, admissibleHeapGib } from './memory-budget.mjs'

export { admissibleHeapGib }

// Peak resident memory per project on a full (no tsbuildinfo) run of the native tsc,
// measured with `/usr/bin/time -l` and rounded up. node and web are the expensive pair:
// run together they exceed a 16 GB machine, and an out-of-memory runner is killed
// mid-check, so the job reports a lost runner instead of a type error. Admission is
// therefore by memory, not by core count alone. Incremental runs cost roughly half.
export const TYPECHECK_PROJECTS = [
  { config: 'tsconfig.node.json', heapGib: 8 },
  { config: 'tsconfig.tc.web.json', heapGib: 5 },
  { config: 'tsconfig.tc.cli.json', heapGib: 1 }
]

export function heapGibFor(config) {
  return TYPECHECK_PROJECTS.find((project) => project.config === config)?.heapGib
}

/**
 * Heaviest first, admitting another project only while it fits both the memory budget and
 * the core count. A project larger than the whole budget still runs, alone, so a small
 * machine makes progress rather than producing an empty batch forever.
 */
export function planTypecheckBatches(projects, { budgetGib, parallelism }) {
  const pending = [...projects].sort((left, right) => right.heapGib - left.heapGib)
  const batches = []

  while (pending.length > 0) {
    const batch = []
    let claimed = 0

    for (let index = 0; index < pending.length;) {
      const project = pending[index]
      const admit =
        batch.length === 0 || (batch.length < parallelism && claimed + project.heapGib <= budgetGib)

      if (admit) {
        batch.push(project)
        claimed += project.heapGib
        pending.splice(index, 1)
      } else {
        index += 1
      }
    }

    batches.push(batch)
  }

  return batches
}

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const tsc = fileURLToPath(new URL('../../node_modules/typescript/bin/tsc', import.meta.url))

// The batch plan bounds THIS process; the lease bounds the machine, because another
// agent's typecheck in the same checkout is invisible to the plan (see memory-budget.mjs).
async function checkProject(project) {
  const release = await acquireMemoryBudget({
    gib: heapGibFor(project) ?? 1,
    label: `tsc ${project}`
  })
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [tsc, '--noEmit', '-p', `config/${project}`], {
        cwd: repoRoot,
        stdio: 'inherit'
      })

      child.on('error', reject)
      child.on('exit', (code, signal) => {
        if (signal) {
          reject(new Error(`tsc ${project} exited with signal ${signal}`))
        } else if (code !== 0) {
          reject(new Error(`tsc ${project} exited with code ${code}`))
        } else {
          resolve()
        }
      })
    })
  } finally {
    release()
  }
}

async function runTypecheckProjects() {
  const batches = planTypecheckBatches(TYPECHECK_PROJECTS, {
    budgetGib: admissibleHeapGib(totalmem()),
    parallelism: availableParallelism()
  })

  // Every batch runs even after one fails, so a single broken project still reports the rest.
  const failures = []
  for (const batch of batches) {
    const results = await Promise.allSettled(batch.map((project) => checkProject(project.config)))
    for (const result of results) {
      if (result.status === 'rejected') {
        failures.push(result.reason)
      }
    }
  }

  return failures
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const failures = await runTypecheckProjects()
  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(failure.message ?? failure)
    }
    process.exit(1)
  }
}
