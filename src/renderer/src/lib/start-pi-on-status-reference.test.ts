import { afterEach, expect, it, vi } from 'vitest'
import { startPiOnStatusReference } from './start-pi-on-status-reference'
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
afterEach(() => vi.unstubAllGlobals())

it('keeps repo, branch and startup options in the existing positional API slots', async () => {
  vi.stubGlobal('navigator', { userAgent: 'Windows' })
  const failure = new Error('creation failed')
  const createWorktree = vi
    .fn<Parameters<typeof startPiOnStatusReference>[0]['createWorktree']>()
    .mockRejectedValue(failure)
  await expect(
    startPiOnStatusReference({
      repoId: 'repo',
      branchName: 'status-task-3',
      prompt: 'Work on STATUS.md line 3',
      createWorktree,
      cmdOverrides: {}
    })
  ).rejects.toBe(failure)
  const args = createWorktree.mock.calls[0]
  expect(args).toHaveLength(17)
  expect(args[0]).toBe('repo')
  expect(args[1]).toBe('status-task-3')
  expect(args[5]).toBe('unknown')
  expect(args[10]).toBe('pi')
  expect(args[16]).toMatchObject({
    launchAgent: 'pi',
    viewMode: 'terminal',
    command: expect.stringMatching(/^pi /)
  })
})
