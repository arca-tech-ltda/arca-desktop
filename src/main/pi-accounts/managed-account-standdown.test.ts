import { expect, it, vi } from 'vitest'
import { standDownManagedHostAccounts } from './managed-account-standdown'
import type { PiAccountProvider } from '../../shared/pi-accounts'

function deps(options: {
  claudeActive: string | null
  codexActive: string | null
  piActive: PiAccountProvider[]
}) {
  const calls: string[] = []
  return {
    calls,
    deps: {
      providers: [
        {
          provider: 'anthropic' as const,
          activeAccountId: options.claudeActive,
          deselect: async () => void calls.push('deselect:anthropic')
        },
        {
          provider: 'openai-codex' as const,
          activeAccountId: options.codexActive,
          deselect: async () => void calls.push('deselect:openai-codex')
        }
      ],
      hasActivePiAccount: async (provider: PiAccountProvider) =>
        options.piActive.includes(provider),
      remirror: async (provider: PiAccountProvider) => void calls.push(`remirror:${provider}`)
    }
  }
}

it('deselects a managed host account and restores the Pi mirror it overwrote', async () => {
  const fixture = deps({ claudeActive: 'acct-1', codexActive: null, piActive: ['anthropic'] })
  expect(await standDownManagedHostAccounts(fixture.deps)).toEqual(['anthropic'])
  expect(fixture.calls).toEqual(['deselect:anthropic', 'remirror:anthropic'])
})

it('skips providers without a managed host selection and does not re-mirror an absent Pi account', async () => {
  const fixture = deps({ claudeActive: null, codexActive: 'acct-2', piActive: [] })
  const remirror = vi.fn(fixture.deps.remirror)
  expect(await standDownManagedHostAccounts({ ...fixture.deps, remirror })).toEqual([
    'openai-codex'
  ])
  expect(fixture.calls).toEqual(['deselect:openai-codex'])
  expect(remirror).not.toHaveBeenCalled()
})
