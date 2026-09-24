import { beforeEach, expect, it, vi } from 'vitest'
const git = vi.hoisted(() => vi.fn())
vi.mock('../git/runner', () => ({
  gitExecFileAsync: git,
  nonInteractiveGitEnv: () => ({ GIT_TERMINAL_PROMPT: '0' })
}))
import { shouldFastForward, syncArcaGit } from './git-sync'

beforeEach(() => {
  git.mockReset()
})
it.each([
  [true, true, 0, 2, true],
  [false, true, 0, 2, false],
  [true, false, 0, 2, false],
  [true, true, 1, 2, false]
])(
  'decides clean=%s default=%s ahead=%s behind=%s',
  (clean, defaultBranch, ahead, behind, merge) => {
    expect(shouldFastForward({ clean, defaultBranch, ahead, behind, autoUpdate: true })).toBe(merge)
  }
)
it.each(['clean', 'dirty', 'branch', 'divergent', 'disabled'])(
  'only merges a clean default fast-forward: %s',
  async (scenario) => {
    git.mockImplementation(async (args: string[]) => {
      if (args[0] === 'ls-remote') {
        return { stdout: 'ref: refs/heads/main\tHEAD\n' }
      }
      if (args[0] === 'branch') {
        return { stdout: scenario === 'branch' ? 'feature' : 'main' }
      }
      if (args[0] === 'status') {
        return { stdout: scenario === 'dirty' ? ' M file' : '' }
      }
      if (args[0] === 'rev-list') {
        return { stdout: scenario === 'divergent' ? '1 2' : '0 2' }
      }
      return { stdout: '' }
    })
    await syncArcaGit('/repo', () => scenario !== 'disabled')
    const merges = git.mock.calls.filter(([args]) => args.includes('merge'))
    expect(merges.length).toBe(scenario === 'clean' ? 1 : 0)
    expect(git).toHaveBeenCalledWith(
      ['fetch', '--prune', 'origin'],
      expect.objectContaining({ timeout: 60_000, env: { GIT_TERMINAL_PROMPT: '0' } })
    )
    if (merges.length) {
      expect(merges[0][0]).toContain('--ff-only')
    }
  }
)
it('does not merge when local changes appear during the final recheck', async () => {
  let statusReads = 0
  git.mockImplementation(async (args: string[]) => {
    if (args[0] === 'ls-remote') {
      return { stdout: 'ref: refs/heads/main\tHEAD\n' }
    }
    if (args[0] === 'branch') {
      return { stdout: 'main' }
    }
    if (args[0] === 'rev-list') {
      return { stdout: '0 2' }
    }
    if (args[0] === 'status') {
      return { stdout: ++statusReads === 1 ? '' : '?? local-file' }
    }
    return { stdout: '' }
  })
  expect(await syncArcaGit('/repo', () => true)).toMatchObject({ state: 'dirty' })
  expect(git.mock.calls.some(([args]) => args.includes('merge'))).toBe(false)
})
