import { describe, expect, it, vi } from 'vitest'
import {
  agentWorktreeRemovalNeedsExtraConfirmation,
  inspectAgentWorktree,
  type AgentWorktreeInspectionGit
} from './agent-worktree-inspection'
import { removeAgentWorktree } from './agent-worktree-removal'
import type { GitStatusEntry } from '../../../../shared/git-status-types'

function changedFiles(count: number): GitStatusEntry[] {
  return Array.from({ length: count }, (_unused, index) => ({
    path: `file-${index}.ts`,
    status: 'modified',
    area: 'unstaged'
  }))
}

function gitStub(overrides: {
  entryCount?: number
  upstreamAhead?: number
  commitsAhead?: number
  statusRejects?: boolean
  compareRejects?: boolean
}): AgentWorktreeInspectionGit {
  return {
    status: vi.fn(() =>
      overrides.statusRejects
        ? Promise.reject(new Error('status failed'))
        : Promise.resolve({
            entries: changedFiles(overrides.entryCount ?? 0),
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
            summary: {
              baseRef: 'main',
              baseOid: 'base',
              compareRef: 'HEAD',
              headOid: 'head',
              mergeBase: 'base',
              changedFiles: 0,
              commitsAhead: overrides.commitsAhead ?? 0,
              status: 'ready' as const
            },
            entries: []
          })
    )
  }
}

describe('inspectAgentWorktree', () => {
  it('reports uncommitted changes and commits ahead of the base ref', async () => {
    const result = await inspectAgentWorktree({
      worktreePath: '/tmp/arca-notif-wt',
      baseRef: 'main',
      git: gitStub({ entryCount: 2, commitsAhead: 4 })
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
