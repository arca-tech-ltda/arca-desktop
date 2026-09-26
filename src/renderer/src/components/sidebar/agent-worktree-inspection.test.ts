import { describe, expect, it, vi } from 'vitest'
import {
  agentWorktreeRemovalNeedsExtraConfirmation,
  inspectAgentWorktree
} from './agent-worktree-inspection'
import { removeAgentWorktree } from './agent-worktree-removal'

function gitStub(overrides: {
  entries?: unknown[]
  upstreamAhead?: number
  commitsAhead?: number
  statusRejects?: boolean
  compareRejects?: boolean
}) {
  return {
    status: vi.fn(() =>
      overrides.statusRejects
        ? Promise.reject(new Error('status failed'))
        : Promise.resolve({
            entries: overrides.entries ?? [],
            ...(overrides.upstreamAhead === undefined
              ? {}
              : {
                  upstreamStatus: {
                    hasUpstream: true,
                    ahead: overrides.upstreamAhead,
                    behind: 0
                  }
                })
          })
    ),
    branchCompare: vi.fn(() =>
      overrides.compareRejects
        ? Promise.reject(new Error('compare failed'))
        : Promise.resolve({
            summary: { status: 'ready', commitsAhead: overrides.commitsAhead ?? 0 },
            entries: []
          })
    )
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: stub only implements the two calls the inspection makes.
  } as unknown as Parameters<typeof inspectAgentWorktree>[0]['git']
}

describe('inspectAgentWorktree', () => {
  it('reports uncommitted changes and commits ahead of the base ref', async () => {
    const result = await inspectAgentWorktree({
      worktreePath: '/tmp/arca-notif-wt',
      baseRef: 'main',
      git: gitStub({ entries: [{}, {}], commitsAhead: 4 })
    })

    expect(result).toEqual({ state: 'ready', uncommittedChanges: 2, commitsAhead: 4 })
  })

  it('falls back to ahead-of-upstream when no base ref is known', async () => {
    const result = await inspectAgentWorktree({
      worktreePath: '/tmp/arca-notif-wt',
      git: gitStub({ upstreamAhead: 3 })
    })

    expect(result).toEqual({ state: 'ready', uncommittedChanges: 0, commitsAhead: 3 })
  })

  it('omits the ahead count when neither comparison resolves', async () => {
    const result = await inspectAgentWorktree({
      worktreePath: '/tmp/arca-notif-wt',
      baseRef: 'main',
      git: gitStub({ compareRejects: true })
    })

    expect(result).toEqual({ state: 'ready', uncommittedChanges: 0 })
  })

  it('fails when status cannot be read', async () => {
    const result = await inspectAgentWorktree({
      worktreePath: '/tmp/arca-notif-wt',
      git: gitStub({ statusRejects: true })
    })

    expect(result).toEqual({ state: 'failed' })
  })
})

describe('agentWorktreeRemovalNeedsExtraConfirmation', () => {
  it('is false only for a checkout proven clean and not ahead', () => {
    expect(
      agentWorktreeRemovalNeedsExtraConfirmation({
        state: 'ready',
        uncommittedChanges: 0,
        commitsAhead: 0
      })
    ).toBe(false)
  })

  it('is true for uncommitted changes, unmerged commits, or an unknown state', () => {
    expect(
      agentWorktreeRemovalNeedsExtraConfirmation({ state: 'ready', uncommittedChanges: 1 })
    ).toBe(true)
    expect(
      agentWorktreeRemovalNeedsExtraConfirmation({
        state: 'ready',
        uncommittedChanges: 0,
        commitsAhead: 2
      })
    ).toBe(true)
    expect(agentWorktreeRemovalNeedsExtraConfirmation({ state: 'failed' })).toBe(true)
    expect(agentWorktreeRemovalNeedsExtraConfirmation(undefined)).toBe(true)
  })
})

describe('removeAgentWorktree', () => {
  it('removes without force and never passes force on its own', async () => {
    const remove = vi.fn(() => Promise.resolve())

    const result = await removeAgentWorktree({
      worktreeId: 'repo::/tmp/arca-notif-wt',
      force: false,
      remove
    })

    expect(result).toEqual({ outcome: 'removed' })
    expect(remove).toHaveBeenCalledWith({ worktreeId: 'repo::/tmp/arca-notif-wt' })
  })

  it('asks for confirmation when git refuses a dirty worktree', async () => {
    const remove = vi.fn(() =>
      Promise.reject(new Error('Worktree has uncommitted or untracked changes.'))
    )

    const result = await removeAgentWorktree({
      worktreeId: 'repo::/tmp/arca-notif-wt',
      force: false,
      remove
    })

    expect(result.outcome).toBe('needs-confirmation')
  })

  it('passes force only when the caller confirmed it', async () => {
    const remove = vi.fn(() => Promise.resolve())

    await removeAgentWorktree({
      worktreeId: 'repo::/tmp/arca-notif-wt',
      hostId: 'local',
      force: true,
      remove
    })

    expect(remove).toHaveBeenCalledWith({
      worktreeId: 'repo::/tmp/arca-notif-wt',
      hostId: 'local',
      force: true
    })
  })

  it('reports an unrelated failure instead of offering force', async () => {
    const remove = vi.fn(() => Promise.reject(new Error('Worktree is locked by Git.')))

    const result = await removeAgentWorktree({
      worktreeId: 'repo::/tmp/arca-notif-wt',
      force: false,
      remove
    })

    expect(result.outcome).toBe('failed')
  })
})
