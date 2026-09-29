import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Repo } from '../../../../shared/repo-types'
import type { ArcaSyncRow, ArcaSyncStatus } from '../../../../shared/arca-projects-sync'

let projects: ArcaSyncRow[] = []

vi.mock('./use-arca-projects-sync', () => ({
  useArcaProjectsSync: (): ArcaSyncStatus => ({
    running: false,
    autoUpdate: false,
    sources: [],
    errors: [],
    projects,
    outside: []
  })
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>
}))

const repo: Repo = {
  id: 'repo-1',
  path: '/repo',
  displayName: 'arca-desktop',
  badgeColor: '#000000',
  addedAt: 1
}

function syncRow(overrides: Partial<ArcaSyncRow> = {}): ArcaSyncRow {
  return {
    repoKey: 'arca/arca-desktop',
    name: 'arca-desktop',
    url: 'https://example.invalid/arca-desktop.git',
    destination: '/repo',
    source: 'file',
    repoId: repo.id,
    state: 'updated',
    ...overrides
  }
}

async function renderBadge(): Promise<string> {
  const { ArcaSyncBadge } = await import('./ArcaSyncBadge')
  return renderToStaticMarkup(<ArcaSyncBadge repo={repo} />)
}

describe('ArcaSyncBadge', () => {
  beforeEach(() => {
    projects = []
  })

  it('renders nothing for the up-to-date resting state', async () => {
    projects = [syncRow({ state: 'updated' })]

    expect(await renderBadge()).toBe('')
  })

  it('renders an attention state as borderless muted text with an accessible name', async () => {
    projects = [syncRow({ state: 'dirty' })]

    const markup = await renderBadge()

    expect(markup).toContain('Local changes')
    expect(markup).toContain('aria-label="Local changes"')
    expect(markup).toContain('text-muted-foreground')
    expect(markup).not.toContain('border')
    expect(markup).not.toContain('rounded-full')
  })

  it('marks failed sync states with the destructive token instead of a pill', async () => {
    projects = [syncRow({ state: 'error', error: 'remote unreachable' })]

    const markup = await renderBadge()

    expect(markup).toContain('text-destructive')
    expect(markup).not.toContain('border')
  })

  it('renders nothing for a project the sync does not track', async () => {
    projects = [syncRow({ repoId: 'other-repo', state: 'dirty' })]

    expect(await renderBadge()).toBe('')
  })
})
