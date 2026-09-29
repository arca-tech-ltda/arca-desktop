import { describe, expect, it } from 'vitest'

import {
  buildImportedWorktreesCardCandidates,
  getHiddenImportedWorktrees
} from './imported-worktrees-card-candidates'
import type { Repo } from '../../../../shared/repo-types'
import type {
  DetectedWorktree,
  DetectedWorktreeListResult,
  Worktree
} from '../../../../shared/worktree/types'

const repo: Repo = {
  id: 'repo-1',
  path: '/repo',
  displayName: 'orca',
  badgeColor: '#000000',
  addedAt: Date.UTC(2026, 4, 24),
  externalWorktreeVisibility: 'hide'
}

const visibleWorktree: Worktree = {
  id: 'repo-1::/repo',
  repoId: repo.id,
  path: '/repo',
  displayName: 'main',
  branch: 'refs/heads/main',
  head: 'abc123',
  isBare: false,
  isMainWorktree: true,
  comment: '',
  linkedIssue: null,
  linkedPR: null,
  linkedLinearIssue: null,
  isArchived: false,
  isUnread: false,
  isPinned: false,
  sortOrder: 0,
  lastActivityAt: 0
}

function detectedWorktree(overrides: Partial<DetectedWorktree> = {}): DetectedWorktree {
  return {
    ...visibleWorktree,
    id: 'repo-1::/repo-worktree',
    path: '/repo-worktree',
    displayName: 'repo-worktree',
    isMainWorktree: false,
    ownership: 'external',
    selectedCheckout: false,
    visible: false,
    ...overrides
  }
}

function detectedResult(
  worktrees: DetectedWorktree[],
  overrides: Partial<DetectedWorktreeListResult> = {}
): DetectedWorktreeListResult {
  return {
    repoId: repo.id,
    authoritative: true,
    source: 'git',
    worktrees,
    ...overrides
  }
}

describe('getHiddenImportedWorktrees', () => {
  it('returns only authoritative hidden external worktrees', () => {
    const hidden = detectedWorktree({ id: 'hidden' })
    const result = getHiddenImportedWorktrees(
      detectedResult([
        hidden,
        detectedWorktree({ id: 'visible', visible: true }),
        detectedWorktree({ id: 'selected', selectedCheckout: true }),
        detectedWorktree({ id: 'orca-managed', ownership: 'orca-managed' }),
        detectedWorktree({
          id: 'agent-scratch',
          path: '/repo/.claude/worktrees/agent-1',
          ownership: 'agent-scratch'
        })
      ])
    )

    expect(result).toEqual([hidden])
  })

  it('suppresses non-authoritative results', () => {
    expect(
      getHiddenImportedWorktrees(detectedResult([detectedWorktree()], { authoritative: false }))
    ).toEqual([])
  })
})

describe('buildImportedWorktreesCardCandidates', () => {
  it('builds a candidate for hidden imported worktrees in a visible repo', () => {
    const candidates = buildImportedWorktreesCardCandidates({
      repos: [repo],
      visibleWorktrees: [visibleWorktree],
      detectedWorktreesByRepo: { [repo.id]: detectedResult([detectedWorktree()]) }
    })

    expect(candidates.get(repo.id)).toMatchObject({
      repo: { id: repo.id },
      hiddenWorktrees: [{ id: 'repo-1::/repo-worktree' }]
    })
  })

  it('builds no candidate when the only hidden worktrees are agent scratch', () => {
    const candidates = buildImportedWorktreesCardCandidates({
      repos: [repo],
      visibleWorktrees: [visibleWorktree],
      detectedWorktreesByRepo: {
        [repo.id]: detectedResult([
          detectedWorktree({
            id: 'agent-scratch',
            path: '/repo/.claude/worktrees/agent-1',
            ownership: 'agent-scratch'
          })
        ])
      }
    })

    expect(candidates.size).toBe(0)
  })

  it('suppresses candidates after show, dismissal, folder repos, or repo filters exclude the repo', () => {
    const detectedWorktreesByRepo = { [repo.id]: detectedResult([detectedWorktree()]) }

    expect(
      buildImportedWorktreesCardCandidates({
        repos: [{ ...repo, externalWorktreeVisibility: 'show' }],
        visibleWorktrees: [visibleWorktree],
        detectedWorktreesByRepo
      }).size
    ).toBe(0)
    expect(
      buildImportedWorktreesCardCandidates({
        repos: [{ ...repo, externalWorktreeVisibilityPromptDismissedAt: 1 }],
        visibleWorktrees: [visibleWorktree],
        detectedWorktreesByRepo
      }).size
    ).toBe(0)
    expect(
      buildImportedWorktreesCardCandidates({
        repos: [{ ...repo, kind: 'folder' }],
        visibleWorktrees: [visibleWorktree],
        detectedWorktreesByRepo
      }).size
    ).toBe(0)
    expect(
      buildImportedWorktreesCardCandidates({
        repos: [repo],
        detectedWorktreesByRepo,
        filterRepoIds: ['other-repo']
      }).size
    ).toBe(0)
  })

  it('keeps candidates visible after a rollback failure forces a shown repo to render the card', () => {
    const candidates = buildImportedWorktreesCardCandidates({
      repos: [{ ...repo, externalWorktreeVisibility: 'show' }],
      visibleWorktrees: [visibleWorktree],
      detectedWorktreesByRepo: { [repo.id]: detectedResult([detectedWorktree()]) },
      forceVisibleRepoIds: new Set([repo.id])
    })

    expect(candidates.get(repo.id)).toMatchObject({
      repo: { id: repo.id },
      hiddenWorktrees: [{ id: 'repo-1::/repo-worktree' }]
    })
  })

  it('builds candidates even when workspace-row filters hide every visible worktree', () => {
    const candidates = buildImportedWorktreesCardCandidates({
      repos: [repo],
      detectedWorktreesByRepo: { [repo.id]: detectedResult([detectedWorktree()]) }
    })

    expect(candidates.has(repo.id)).toBe(true)
  })
  it('splits agent worktrees out of the discovery prompt', () => {
    const candidates = buildImportedWorktreesCardCandidates({
      repos: [repo],
      detectedWorktreesByRepo: {
        [repo.id]: detectedResult([
          detectedWorktree({
            id: 'repo-1::/repo',
            path: '/repo',
            isMainWorktree: true,
            selectedCheckout: true
          }),
          detectedWorktree(),
          detectedWorktree({
            id: 'repo-1::/tmp/arca-notif-wt',
            path: '/tmp/arca-notif-wt',
            displayName: 'arca-notif-wt',
            agentWork: { source: 'marker', agent: 'claude', task: 'Wire notifications' }
          })
        ])
      }
    })

    expect(candidates.get(repo.id)).toMatchObject({
      hiddenWorktrees: [{ id: 'repo-1::/repo-worktree' }],
      agentWorktrees: [{ id: 'repo-1::/tmp/arca-notif-wt' }],
      agentBaseRef: 'main'
    })
  })

  it('keeps agent worktrees after the discovery prompt was dismissed', () => {
    const candidates = buildImportedWorktreesCardCandidates({
      repos: [{ ...repo, externalWorktreeVisibilityPromptDismissedAt: 1 }],
      detectedWorktreesByRepo: {
        [repo.id]: detectedResult([
          detectedWorktree(),
          detectedWorktree({
            id: 'repo-1::/tmp/arca-ui-wt',
            path: '/tmp/arca-ui-wt',
            agentWork: { source: 'temp-dir' }
          })
        ])
      }
    })

    expect(candidates.get(repo.id)).toMatchObject({
      hiddenWorktrees: [],
      agentWorktrees: [{ id: 'repo-1::/tmp/arca-ui-wt' }]
    })
  })

  // Why: the "N agents working" summary line is fed by these candidates. If it ever
  // picked up a worktree the sidebar already renders as a card, it would just repeat
  // that card's agent row; its only job is agents in worktrees with no card.
  it('never summarizes agents from worktrees the sidebar already shows as cards', () => {
    const candidates = buildImportedWorktreesCardCandidates({
      repos: [repo],
      detectedWorktreesByRepo: {
        [repo.id]: detectedResult([
          detectedWorktree({
            id: 'repo-1::/repo/worktrees/shown',
            path: '/repo/worktrees/shown',
            visible: true,
            agentWork: { source: 'marker', agent: 'claude', task: 'Shown in a card' }
          }),
          detectedWorktree({
            id: 'repo-1::/tmp/arca-hidden-wt',
            path: '/tmp/arca-hidden-wt',
            visible: false,
            agentWork: { source: 'marker', agent: 'codex', task: 'No card for this one' }
          })
        ])
      }
    })

    expect(candidates.get(repo.id)?.agentWorktrees).toEqual([
      expect.objectContaining({ id: 'repo-1::/tmp/arca-hidden-wt' })
    ])
  })

  it('builds no candidate when a project only has agents inside worktrees it already shows', () => {
    expect(
      buildImportedWorktreesCardCandidates({
        repos: [repo],
        detectedWorktreesByRepo: {
          [repo.id]: detectedResult([
            detectedWorktree({
              visible: true,
              agentWork: { source: 'marker', agent: 'claude', task: 'Shown in a card' }
            })
          ])
        }
      }).size
    ).toBe(0)
  })

  it('builds no candidate when a dismissed project has only ordinary discovered worktrees', () => {
    expect(
      buildImportedWorktreesCardCandidates({
        repos: [{ ...repo, externalWorktreeVisibilityPromptDismissedAt: 1 }],
        detectedWorktreesByRepo: { [repo.id]: detectedResult([detectedWorktree()]) }
      }).size
    ).toBe(0)
  })
})
