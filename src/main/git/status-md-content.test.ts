import { expect, it, vi } from 'vitest'
import { readStatusMdContent } from './status-md-content'

const read = vi.hoisted(() => vi.fn())
vi.mock('node:fs/promises', () => ({ readFile: read }))

it('shares in-flight content across consumers without retaining stale text', async () => {
  let finish = (_text: string) => {}
  read.mockImplementationOnce(
    () =>
      new Promise<string>((resolve) => {
        finish = resolve
      })
  )
  const tasks = readStatusMdContent('/repo/STATUS.md')
  const priorities = readStatusMdContent('/repo/STATUS.md')
  expect(tasks).toBe(priorities)
  expect(read).toHaveBeenCalledTimes(1)
  finish('old')
  expect(await tasks).toBe('old')
  read.mockResolvedValueOnce('new')
  expect(await readStatusMdContent('/repo/STATUS.md')).toBe('new')
  expect(read).toHaveBeenCalledTimes(2)
})
