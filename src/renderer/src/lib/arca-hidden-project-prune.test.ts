import { describe, expect, it } from 'vitest'
import { planArcaHiddenProjectPrune, type ArcaPrunableRepo } from './arca-hidden-project-prune'

function repo(overrides: Partial<ArcaPrunableRepo> = {}): ArcaPrunableRepo {
  return {
    id: 'repo',
    gitRemoteIdentity: { canonicalKey: 'github.com/arca-tech-ltda/arca' },
    ...overrides
  }
}

describe('planArcaHiddenProjectPrune', () => {
  it('prunes a local registration of a hidden ARCA repo', () => {
    expect(planArcaHiddenProjectPrune([repo()], new Set())).toEqual([
      { repoId: 'repo', repoKey: 'github.com/arca-tech-ltda/arca' }
    ])
  })

  it('prunes the legacy brain repo too', () => {
    const plan = planArcaHiddenProjectPrune(
      [
        repo({
          id: 'brain',
          gitRemoteIdentity: { canonicalKey: 'github.com/arca-tech-ltda/brain' }
        })
      ],
      new Set()
    )
    expect(plan).toEqual([{ repoId: 'brain', repoKey: 'github.com/arca-tech-ltda/brain' }])
  })

  it('keeps repos with no remote identity, so a folder name alone never matches', () => {
    expect(planArcaHiddenProjectPrune([repo({ gitRemoteIdentity: null })], new Set())).toEqual([])
    expect(planArcaHiddenProjectPrune([repo({ gitRemoteIdentity: undefined })], new Set())).toEqual(
      []
    )
  })

  it('keeps visible ARCA repos', () => {
    const repos = [
      repo({
        id: 'desktop',
        gitRemoteIdentity: { canonicalKey: 'github.com/arca-tech-ltda/arca-desktop' }
      }),
      repo({ id: 'other', gitRemoteIdentity: { canonicalKey: 'github.com/someone/arca' } })
    ]
    expect(planArcaHiddenProjectPrune(repos, new Set())).toEqual([])
  })

  it('skips remote execution hosts', () => {
    const repos = [
      repo({ id: 'ssh', connectionId: 'host-1' }),
      repo({ id: 'runtime', executionHostId: 'runtime:env-1' })
    ]
    expect(planArcaHiddenProjectPrune(repos, new Set())).toEqual([])
  })

  it('skips a repo key already pruned once, so a manual re-add sticks', () => {
    expect(
      planArcaHiddenProjectPrune([repo()], new Set(['github.com/arca-tech-ltda/arca']))
    ).toEqual([])
  })
})
