// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MegamindSetup, piInstallCommand } from './MegamindSetup'
import type { MegamindPrerequisites } from '../../../../../shared/arca-megamind'
import type { MegamindConnection } from './use-megamind-connection'

const connection: MegamindConnection = {
  status: { state: 'connected', device: 'mac ARCA Desktop' },
  failed: false,
  busy: false,
  start: () => {}
}

const requirements = (overrides: Partial<MegamindPrerequisites>): MegamindPrerequisites => ({
  mode: 'pi',
  agent: false,
  piArcaMissing: false,
  installer: true,
  repoPath: '/Users/enzo/ARCA/arca',
  windows: false,
  ...overrides
})

function setup(prerequisites: MegamindPrerequisites): void {
  Object.assign(window, {
    api: { arcaMegamind: { prerequisites: vi.fn().mockResolvedValue(prerequisites) } }
  })
  render(<MegamindSetup connection={connection} expanded={false} />)
}

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

it('tells a Pi machine without the ARCA Pi links what to install', async () => {
  setup(requirements({ piArcaMissing: true }))
  await waitFor(() =>
    expect(screen.getByRole('status').textContent).toBe(
      'Pi without ARCA Pi: run the installer so Megamind loads in Pi.'
    )
  )
  expect(screen.getByRole('button', { name: 'Install ARCA Pi' })).toBeTruthy()
})

it('keeps the workspace installer for the managed agents', async () => {
  setup(requirements({ mode: 'managed' }))
  await waitFor(() =>
    expect(screen.getByRole('status').textContent).toBe(
      'Megamind is not set up for Claude Code or Codex on this computer.'
    )
  )
  expect(screen.getByRole('button', { name: 'Run workspace installer' })).toBeTruthy()
})

it('runs the installer of the detected repo, per platform', () => {
  expect(piInstallCommand(requirements({}))).toBe('"/Users/enzo/ARCA/arca/install.sh" --pi')
  expect(piInstallCommand(requirements({ windows: true, repoPath: 'C:\\ARCA\\arca' }))).toBe(
    '& "C:\\ARCA\\arca\\install.ps1" -Pi'
  )
})
