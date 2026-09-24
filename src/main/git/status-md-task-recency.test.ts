import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseStatusMd } from '../../shared/status-md-tasks'
import { gitExecFileAsync } from './runner'
import {
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
