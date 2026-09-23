import { expect, it } from 'vitest'
import { buildAgentStartupPlan } from './tui-agent-startup'

it.each(['posix', 'powershell', 'cmd'] as const)(
  'passes Pi extensions from host environment in %s',
  (shell) => {
    const plan = buildAgentStartupPlan({
      agent: 'pi',
      prompt: 'hello',
      cmdOverrides: {},
      platform: shell === 'posix' ? 'linux' : 'win32',
      shell
    })
    const prefix = shell === 'cmd' ? '%' : shell === 'powershell' ? '$env:' : '$'
    const suffix = shell === 'cmd' ? '%' : ''
    for (const kind of ['TITLEBAR', 'PREFILL', 'STATUS']) {
      expect(plan?.launchCommand).toContain(`--extension "${prefix}ORCA_PI_EXT_${kind}${suffix}"`)
    }
    expect(plan?.expectedProcess).toBe('pi')
    expect(plan?.launchConfig).not.toHaveProperty('ORCA_PI_EXT_STATUS')
  }
)

it('passes only the status extension on explicit Prime launches', () => {
  const plan = buildAgentStartupPlan({
    agent: 'prime-agent',
    prompt: 'hello',
    cmdOverrides: {},
    platform: 'linux'
  })
  expect(plan?.launchCommand).toContain('--extension "$ORCA_PRIME_AGENT_STATUS_EXTENSION"')
  expect(plan?.launchCommand).not.toContain('ORCA_PI_EXT_')
})
