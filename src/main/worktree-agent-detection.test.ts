import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  annotateAgentWorktrees,
  detectAgentWorktree,
  listAgentWorktreeTempRoots,
  readWorktreeAdminDir
} from './worktree-agent-detection'
import type { DetectedWorktree } from '../shared/worktree/types'

const root = mkdtempSync(join(tmpdir(), 'arca-agent-marker-'))

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

function createLinkedWorktree(name: string, marker?: string): string {
  const worktreePath = join(root, name)
  const adminDir = join(root, 'repo', '.git', 'worktrees', name)
  mkdirSync(worktreePath, { recursive: true })
  mkdirSync(adminDir, { recursive: true })
  writeFileSync(join(worktreePath, '.git'), `gitdir: ${adminDir}\n`)
  if (marker !== undefined) {
    writeFileSync(join(adminDir, 'arca-agent.json'), marker)
  }
  return worktreePath
}

function detectedWorktree(
  path: string,
  overrides: Partial<DetectedWorktree> = {}
): DetectedWorktree {
  return {
    id: `repo::${path}`,
    repoId: 'repo',
    path,
    displayName: 'wt',
    branch: 'refs/heads/wt',
    head: 'abc123',
    isBare: false,
    isMainWorktree: false,
    selectedCheckout: false,
    ownership: 'external',
    visible: false,
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 0,
    ...overrides
  }
}

describe('readWorktreeAdminDir', () => {
  it('resolves the gitdir pointer of a linked worktree', () => {
    const worktreePath = createLinkedWorktree('pointer')
    expect(readWorktreeAdminDir(worktreePath)).toBe(
      join(root, 'repo', '.git', 'worktrees', 'pointer')
    )
  })

  it('returns nothing for a directory with no .git file', () => {
    expect(readWorktreeAdminDir(join(root, 'missing'))).toBeUndefined()
  })
})

describe('detectAgentWorktree', () => {
  it('reads a marker from the worktree admin dir', () => {
    const worktreePath = createLinkedWorktree(
      'marked',
      JSON.stringify({ agent: 'claude', task: 'Wire the sidebar' })
    )
    expect(detectAgentWorktree(worktreePath, ['/nowhere'])).toMatchObject({
      source: 'marker',
      agent: 'claude',
      task: 'Wire the sidebar'
    })
  })

  it('reports a host-observed last modification time', () => {
    const worktreePath = createLinkedWorktree('touched', '{}')
    const detected = detectAgentWorktree(worktreePath, ['/nowhere'])
    expect(detected?.lastModifiedAt).toBeGreaterThan(0)
  })

  it('classifies an unmarked worktree under a temp root by path', () => {
    const worktreePath = createLinkedWorktree('unmarked')
    expect(detectAgentWorktree(worktreePath, [root])).toMatchObject({ source: 'temp-dir' })
  })

  it('leaves an unmarked worktree outside every temp root unclassified', () => {
    const worktreePath = createLinkedWorktree('ordinary')
    expect(detectAgentWorktree(worktreePath, ['/nowhere'])).toBeUndefined()
  })
})

describe('listAgentWorktreeTempRoots', () => {
  it('includes the OS temp dir and never a blank entry', () => {
    const roots = listAgentWorktreeTempRoots()
    expect(roots).toContain(tmpdir())
    expect(roots.every((entry) => entry.length > 0)).toBe(true)
    if (process.platform === 'darwin') {
      expect(roots).toContain('/private/tmp')
    }
    if (process.platform !== 'win32') {
      expect(roots).toContain('/tmp')
    }
  })
})

describe('annotateAgentWorktrees', () => {
  it('annotates only non-managed linked checkouts', () => {
    const agentPath = createLinkedWorktree('annotated', '{"agent":"codex"}')
    const managedPath = createLinkedWorktree('managed', '{"agent":"codex"}')
    const rows = annotateAgentWorktrees([
      detectedWorktree(agentPath),
      detectedWorktree(managedPath, { ownership: 'orca-managed' }),
      detectedWorktree(join(root, 'main'), { isMainWorktree: true, selectedCheckout: true })
    ])
    expect(rows[0].agentWork).toMatchObject({ source: 'marker', agent: 'codex' })
    expect(rows[1].agentWork).toBeUndefined()
    expect(rows[2].agentWork).toBeUndefined()
  })
})
