import { describe, expect, it } from 'vitest'
import { isArcaProjectExcludedByDefault } from './arca-product'

describe('isArcaProjectExcludedByDefault', () => {
  it('excludes the ARCA org central repo', () => {
    expect(
      isArcaProjectExcludedByDefault({ name: 'arca', repoKey: 'github.com/arca-tech-ltda/arca' })
    ).toBe(true)
    expect(isArcaProjectExcludedByDefault({ repoKey: 'arca-tech-ltda/arca' })).toBe(true)
    expect(isArcaProjectExcludedByDefault({ name: 'arca' })).toBe(true)
  })

  it('keeps repos whose name only starts with arca', () => {
    expect(
      isArcaProjectExcludedByDefault({
        name: 'arca-desktop',
        repoKey: 'github.com/arca-tech-ltda/arca-desktop'
      })
    ).toBe(false)
    expect(
      isArcaProjectExcludedByDefault({
        name: 'arca-pi',
        repoKey: 'github.com/arca-tech-ltda/arca-pi'
      })
    ).toBe(false)
  })

  it('keeps an `arca` repo owned by another org', () => {
    expect(
      isArcaProjectExcludedByDefault({ name: 'arca', repoKey: 'github.com/someone/arca' })
    ).toBe(false)
  })

  it('still excludes the legacy brain repo, archived and legacy projects', () => {
    expect(isArcaProjectExcludedByDefault({ repoKey: 'github.com/arca-tech-ltda/brain' })).toBe(
      true
    )
    expect(isArcaProjectExcludedByDefault({ name: 'brain' })).toBe(true)
    expect(isArcaProjectExcludedByDefault({ name: 'ship', archived: true })).toBe(true)
    expect(isArcaProjectExcludedByDefault({ name: 'ship', legacy: true })).toBe(true)
  })

  it('keeps an ordinary project', () => {
    expect(
      isArcaProjectExcludedByDefault({ name: 'ship', repoKey: 'github.com/arca-tech-ltda/ship' })
    ).toBe(false)
  })
})
