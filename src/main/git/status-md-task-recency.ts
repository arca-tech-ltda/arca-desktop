import { stat } from 'node:fs/promises'
import type { StatusMdTask } from '../../shared/status-md-tasks'
import { gitExecFileAsync } from './runner'

const BLAME_TIMEOUT_MS = 8_000
const STATUS_FILE = 'STATUS.md'

type CacheEntry = {
  key: string
  timestamps: ReadonlyMap<number, number>
}

type RecencyDependencies = {
  statFile: (path: string) => Promise<{ mtimeMs: number; size: number }>
  git: (args: string[], options: { cwd: string; timeout: number }) => Promise<{ stdout: string }>
}

const cache = new Map<string, CacheEntry>()

const dependencies: RecencyDependencies = {
  statFile: stat,
  git: gitExecFileAsync
}

function parseBlameTimestamps(output: string, fallbackTimestamp: number): Map<number, number> {
  const timestamps = new Map<number, number>()
  const lines = output.split(/\r?\n/)
  let lineNumber: number | null = null
  let timestamp: number | null = null
  let uncommitted = false

  for (const line of lines) {
    const header = /^([0-9a-f]{40,64})\s+\d+\s+(\d+)(?:\s+\d+)?$/.exec(line)
    if (header) {
      lineNumber = Number(header[2])
      timestamp = null
      uncommitted = /^0+$/.test(header[1])
      continue
    }
    if (line.startsWith('author-time ')) {
      timestamp = Number(line.slice('author-time '.length)) * 1000
      continue
    }
    if (line.startsWith('\t') && lineNumber !== null) {
      timestamps.set(
        lineNumber,
        uncommitted || timestamp === null || !Number.isFinite(timestamp)
          ? fallbackTimestamp
          : timestamp
      )
      lineNumber = null
    }
  }
  return timestamps
}

async function gitHead(repoPath: string, deps: RecencyDependencies): Promise<string> {
  try {
    const { stdout } = await deps.git(['rev-parse', 'HEAD'], {
      cwd: repoPath,
      timeout: BLAME_TIMEOUT_MS
    })
    return stdout.trim()
  } catch {
    return 'unborn'
  }
}

export async function statusMdTaskTimestamps(
  repoPath: string,
  statusPath: string,
  tasks: readonly StatusMdTask[],
  deps: RecencyDependencies = dependencies
): Promise<Map<number, number>> {
  const file = await deps.statFile(statusPath)
  const head = await gitHead(repoPath, deps)
  const key = `${file.mtimeMs}:${file.size}:${head}`
  const cached = cache.get(statusPath)
  if (cached?.key === key) {
    return new Map(cached.timestamps)
  }

  let timestamps = new Map<number, number>()
  try {
    const { stdout } = await deps.git(['blame', '--line-porcelain', '--', STATUS_FILE], {
      cwd: repoPath,
      timeout: BLAME_TIMEOUT_MS
    })
    timestamps = parseBlameTimestamps(stdout, file.mtimeMs)
  } catch {
    // Non-git folders and unborn repositories use the file timestamp.
  }
  for (const task of tasks) {
    if (!timestamps.has(task.lineNumber)) {
      timestamps.set(task.lineNumber, file.mtimeMs)
    }
  }
  cache.set(statusPath, { key, timestamps })
  return new Map(timestamps)
}

export function resetStatusMdTaskRecencyCacheForTests(): void {
  cache.clear()
}
