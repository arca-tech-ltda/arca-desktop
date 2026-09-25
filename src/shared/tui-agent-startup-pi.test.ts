import { expect, it } from 'vitest'
import { recognizeAgentProcessFromCommandLine } from './agent-process-recognition'
import { buildAgentStartupPlan, buildAgentDraftLaunchPlan } from './tui-agent-startup'
import { withPiManagedExtensions } from './tui-agent-pi-extensions'

it.each(['posix', 'powershell', 'cmd'] as const)(
  'keeps Pi recognizable before and after host extension injection in %s',
  (shell) => {
    for (const builder of [buildAgentStartupPlan, buildAgentDraftLaunchPlan]) {
      const plan = builder({
        agent: 'pi',
        prompt: 'hello',
        draft: 'hello',
        cmdOverrides: {},
        platform: shell === 'posix' ? 'linux' : 'win32',
        shell
      })
      expect(plan).not.toBeNull()
      const command = plan!.launchCommand
      expect(recognizeAgentProcessFromCommandLine(command)?.agent).toBe('pi')
      expect(command).not.toContain('--extension')
      const extended = withPiManagedExtensions(command, shell, {
        ORCA_PANE_KEY: 'pane',
        ORCA_PI_EXT_STATUS: '/host/status.ts',
        ORCA_PI_EXT_PREFILL: '/host/prefill.ts'
      })
      expect(recognizeAgentProcessFromCommandLine(extended)?.agent).toBe('pi')
      expect(extended).toContain('/host/status.ts')
      expect(extended).toContain('/host/prefill.ts')
      expect(extended).not.toContain('TITLEBAR')
      expect(
        withPiManagedExtensions(extended, shell, {
          ORCA_PANE_KEY: 'pane',
          ORCA_PI_EXT_STATUS: '/host/status.ts'
        })
      ).toBe(extended)
    }
  }
)

it('injects only installed Prime extensions on the execution host', () => {
  const plan = buildAgentStartupPlan({
    agent: 'prime-agent',
    prompt: 'hello',
    cmdOverrides: {},
    platform: 'linux'
  })!
  expect(plan.launchCommand.startsWith('prime-agent')).toBe(true)
  expect(
    withPiManagedExtensions(plan.launchCommand, 'posix', {
      ORCA_PANE_KEY: 'pane',
      ORCA_PRIME_AGENT_STATUS_EXTENSION: '/host/prime.ts',
      ORCA_PI_EXT_STATUS: '/host/pi.ts'
    })
  ).toContain("--extension '/host/prime.ts'")
})
