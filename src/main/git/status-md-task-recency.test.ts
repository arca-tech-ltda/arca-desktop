import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseStatusMd } from '../../shared/status-md-tasks'
import { gitExecFileAsync } from './runner'
import {
  invalidateStatusMdTaskRecency,
  resetStatusMdTaskRecencyCacheForTests,
  statusMdTaskTimestamps
} from './status-md-task-recency'

const directories: string[] = []

async function git(cwd: string, args: string[], env?: NodeJS.ProcessEnv): Promise<string> {
  const result = await gitExecFileAsync(args, { cwd, env })
  return result.stdout
}

async function commit(cwd: string, message: string, date: string): Promise<void> {
  await git(cwd, ['add', 'STATUS.md'])
  await git(
    cwd,
    ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', message],
    {
      ...process.env,
      GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_DATE: date
    }
  )
}

async function fixture(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'arca-status-recency-'))
  directories.push(directory)
  await git(directory, ['init'])
  await writeFile(join(directory, 'STATUS.md'), '# Now\n- [ ] Older\n- [x] Done\n')
  await commit(directory, 'first', '2024-01-01T12:00:00Z')
  await writeFile(join(directory, 'STATUS.md'), '# Now\n- [ ] Newer\n- [x] Done\n')
  await commit(directory, 'second', '2024-02-01T12:00:00Z')
  return directory
}

afterEach(async () => {
  resetStatusMdTaskRecencyCacheForTests()
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe('statusMdTaskTimestamps', () => {
  it('uses each task line commit time and the file mtime for uncommitted lines', async () => {
    const directory = await fixture()
    const statusPath = join(directory, 'STATUS.md')
    await writeFile(statusPath, '# Now\n- [ ] Newer\n- [x] Done\n- [ ] Uncommitted\n')
    const tasks = parseStatusMd(await readFile(statusPath, 'utf8')).tasks

    const timestamps = await statusMdTaskTimestamps(directory, statusPath, tasks)

    expect(timestamps.get(2)).toBe(Date.parse('2024-02-01T12:00:00Z'))
    expect(timestamps.get(3)).toBe(Date.parse('2024-01-01T12:00:00Z'))
    expect(timestamps.get(4)).toBeGreaterThan(Date.parse('2024-02-01T12:00:00Z'))
    expect(
      [...tasks]
        .sort(
          (left, right) =>
            (timestamps.get(right.lineNumber) ?? 0) - (timestamps.get(left.lineNumber) ?? 0)
        )
        .map((task) => task.title)
    ).toEqual(['Uncommitted', 'Newer', 'Done'])
  })

  it('caches blame by file mtime and HEAD', async () => {
    const directory = await fixture()
    const statusPath = join(directory, 'STATUS.md')
    const markdown = await readFile(statusPath, 'utf8')
    const tasks = parseStatusMd(markdown).tasks
    let blameCalls = 0
    const countingGit = async (args: string[], options: { cwd: string; timeout: number }) => {
      if (args[0] === 'blame') {
        blameCalls += 1
      }
      return gitExecFileAsync(args, options)
    }

    await statusMdTaskTimestamps(directory, statusPath, tasks, {
      statFile: stat,
      git: countingGit
    })
    await statusMdTaskTimestamps(directory, statusPath, tasks, {
      statFile: stat,
      git: countingGit
    })

    expect(blameCalls).toBe(1)
  })
})

it('shares concurrent HEAD/blame scans and invalidates on HEAD without a file change', async () => {
  let head = 'first'
  const git = vi.fn(async (args: string[]) => ({ stdout: args[0] === 'rev-parse' ? head : '' }))
  const statFile = vi.fn(async () => ({ mtimeMs: 123, size: 10 }))
  const tasks = parseStatusMd('- [ ] Task').tasks
  const read = () => statusMdTaskTimestamps('/repo', '/repo/STATUS.md', tasks, { git, statFile })
  const results = await Promise.all(Array.from({ length: 10 }, read))
  expect(statFile).toHaveBeenCalledTimes(1)
  expect(git.mock.calls.map(([args]) => args[0])).toEqual(['rev-parse', 'blame'])
  expect(results[0].get(1)).toBe(123)
  results[0].clear()
  expect(results[1].get(1)).toBe(123)
  await read()
  expect(git.mock.calls.filter(([args]) => args[0] === 'blame')).toHaveLength(1)
  head = 'second'
  await read()
  expect(git.mock.calls.filter(([args]) => args[0] === 'blame')).toHaveLength(2)
})

it('bounds scans globally across concurrent callers and repositories', async () => {
  let active = 0
  let peak = 0
  const git = async () => {
    active++
    peak = Math.max(peak, active)
    await new Promise<void>((resolve) => setImmediate(resolve))
    active--
    return { stdout: '' }
  }
  await Promise.all(
    Array.from({ length: 20 }, (_, index) =>
      statusMdTaskTimestamps(`/repo-${index}`, `/repo-${index}/STATUS.md`, [], {
        git,
        statFile: async () => ({ mtimeMs: 123, size: 10 })
      })
    )
  )
  expect(peak).toBe(4)
})

it('rechecks an in-flight scan immediately after project sync', async () => {
  let unblock = () => {}
  const blocked = new Promise<void>((resolve) => {
    unblock = resolve
  })
  const git = vi.fn(async (args: string[]) => {
    if (args[0] === 'rev-parse') {
      return { stdout: 'head' }
    }
    await blocked
    return { stdout: '' }
  })
  const statFile = vi.fn(async () => ({ mtimeMs: 123, size: 10 }))
  const read = () => statusMdTaskTimestamps('/repo', '/repo/STATUS.md', [], { git, statFile })
  const first = read()
  await vi.waitFor(() => expect(git).toHaveBeenCalledTimes(2))
  invalidateStatusMdTaskRecency('/repo')
  const synced = read()
  unblock()
  await Promise.all([first, synced])
  expect(git.mock.calls.filter(([args]) => args[0] === 'rev-parse')).toHaveLength(2)
})

it('invalidates on mtime and size and falls back to mtime outside git', async () => {
  let file = { mtimeMs: 123, size: 10 }
  const git = vi.fn(async () => {
    throw new Error('not a repository')
  })
  const tasks = parseStatusMd('- [ ] Task').tasks
  const read = () =>
    statusMdTaskTimestamps('/folder', '/folder/STATUS.md', tasks, {
      git,
      statFile: async () => file
    })
  expect((await read()).get(1)).toBe(123)
  file = { mtimeMs: 456, size: 10 }
  expect((await read()).get(1)).toBe(456)
  file = { mtimeMs: 456, size: 20 }
  await read()
  expect(git).toHaveBeenCalledTimes(6)
})
