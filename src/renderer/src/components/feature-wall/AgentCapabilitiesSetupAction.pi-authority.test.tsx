// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CliInstallStatus } from '../../../../shared/cli-install-types'
import type * as ArcaProduct from '../../../../shared/arca-product'
import type * as AgentCapabilitySetupStatus from './agent-capability-setup-status'
import type * as AgentSkillCliPrerequisite from '@/lib/agent-skill-cli-prerequisite'

const arcaProduct = vi.hoisted(() => ({ ARCA_PI_IS_AUTHORITY: true }))
vi.mock('../../../../shared/arca-product', async (importOriginal) => ({
  ...(await importOriginal<typeof ArcaProduct>()),
  get ARCA_PI_IS_AUTHORITY() {
    return arcaProduct.ARCA_PI_IS_AUTHORITY
  }
}))
vi.mock('@/hooks/useActiveProjectSkillRuntime', () => ({
  useActiveProjectSkillRuntime: () => ({
    installDisabledReason: null,
    canUseLocalSkillFreshness: false
  })
}))
vi.mock('./agent-capability-setup-status', async (importOriginal) => ({
  ...(await importOriginal<typeof AgentCapabilitySetupStatus>()),
  useAgentCapabilitySetupStatus: () => ({
    readiness: {
      browserUseSkillInstalled: false,
      browserUseSkillLoading: false,
      computerUseSkillInstalled: false,
      computerUseSkillLoading: false,
      computerUseReady: false,
      computerUseChecking: false,
      computerUseUnavailable: false,
      orchestrationSkillInstalled: false,
      orchestrationSkillLoading: false
    },
    installStatus: {
      browserUse: { label: '', tone: 'pending' },
      computerUse: { label: '', tone: 'pending' },
      orchestration: { label: '', tone: 'pending' },
      linearTickets: { label: '', tone: 'pending' }
    }
  })
}))
vi.mock('sonner', () => ({
  toast: {
    message: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn()
  }
}))
// Skips the 700ms pre-registration toast delay.
vi.mock('@/lib/agent-skill-cli-prerequisite', async (importOriginal) => ({
  ...(await importOriginal<typeof AgentSkillCliPrerequisite>()),
  showOrcaCliRegistrationPromptToast: vi.fn(async () => {})
}))

import { AgentCapabilitiesSetupAction } from './AgentCapabilitiesSetupAction'

const NOT_REGISTERED_STATUS: CliInstallStatus = {
  platform: 'darwin',
  commandName: 'arca',
  commandPath: null,
  pathDirectory: '/usr/local/bin',
  pathConfigured: false,
  launcherPath: null,
  installMethod: 'symlink',
  supported: true,
  state: 'not_installed',
  currentTarget: null,
  unsupportedReason: null,
  detail: null
}

const REGISTERED_STATUS: CliInstallStatus = {
  ...NOT_REGISTERED_STATUS,
  commandPath: '/usr/local/bin/arca',
  pathConfigured: true,
  state: 'installed'
}

const cliApi = {
  getInstallStatus: vi.fn(async () => NOT_REGISTERED_STATUS),
  install: vi.fn(async () => REGISTERED_STATUS)
}
const writeClipboardText = vi.fn(async () => {})

const mountedRoots: Root[] = []

async function render(): Promise<HTMLElement> {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  mountedRoots.push(root)
  await act(async () => {
    root.render(
      <AgentCapabilitiesSetupAction
        onOrchestrationSkillInstalledChange={() => {}}
        onBrowserUseSkillInstalledChange={() => {}}
      />
    )
  })
  return container
}

describe('AgentCapabilitiesSetupAction with Pi as the authority', () => {
  beforeEach(() => {
    arcaProduct.ARCA_PI_IS_AUTHORITY = true
    cliApi.getInstallStatus.mockResolvedValue(NOT_REGISTERED_STATUS)
    vi.stubGlobal('window', window)
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        cli: cliApi,
        ui: { writeClipboardText },
        computerUsePermissions: {
          getStatus: vi.fn(async () => ({
            platform: 'darwin',
            helperAppPath: null,
            helperUnavailableReason: null,
            permissions: []
          })),
          openSetup: vi.fn()
        },
        developerPermissions: { getStatus: vi.fn(async () => []) }
      }
    })
  })

  afterEach(async () => {
    await act(async () => {
      for (const root of mountedRoots.splice(0)) {
        root.unmount()
      }
    })
    document.body.innerHTML = ''
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('offers CLI registration instead of the Orca skill cards', async () => {
    const container = await render()

    expect(container.textContent).toContain('Install CLI')
    expect(container.textContent).not.toContain('Agent Orchestration')
    expect(container.textContent).not.toContain('Agent Browser Use')
    expect(container.textContent).not.toContain('Computer Use')
  })

  it('registers the command without copying a skill install command', async () => {
    const container = await render()
    const button = [...container.querySelectorAll('button')].find((candidate) =>
      candidate.textContent?.includes('Install CLI')
    )

    await act(async () => {
      button?.click()
    })

    expect(cliApi.install).toHaveBeenCalledTimes(1)
    expect(writeClipboardText).not.toHaveBeenCalled()
  })

  it('reports an already registered command as done', async () => {
    cliApi.getInstallStatus.mockResolvedValue(REGISTERED_STATUS)

    const container = await render()

    expect(container.textContent).toContain('Registered')
    expect(container.textContent).toContain('/usr/local/bin/arca')
  })

  it('keeps the upstream skill cards when Pi is not the authority', async () => {
    arcaProduct.ARCA_PI_IS_AUTHORITY = false

    const container = await render()

    expect(container.textContent).toContain('Agent Orchestration')
    expect(container.textContent).toContain('Agent Browser Use')
  })
})
