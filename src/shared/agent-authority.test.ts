import { expect, it } from 'vitest'
import type { ClaudeManagedAccount, CodexManagedAccount } from './managed-account-types'
import {
  hasManagedHostAgentAccounts,
  resolveAgentAuthority,
  shouldStandDownManagedHostAccounts
} from './agent-authority'

const claudeAccount = (patch: Partial<ClaudeManagedAccount> = {}): ClaudeManagedAccount => ({
  id: 'claude-1',
  email: 'socio@arca.tech',
  managedAuthPath: '/u/claude-accounts/claude-1/auth',
  authMethod: 'subscription-oauth',
  createdAt: 0,
  updatedAt: 0,
  lastAuthenticatedAt: 0,
  ...patch
})

const codexAccount = (patch: Partial<CodexManagedAccount> = {}): CodexManagedAccount => ({
  id: 'codex-1',
  email: 'socio@arca.tech',
  managedHomePath: '/u/codex-accounts/codex-1',
  createdAt: 0,
  updatedAt: 0,
  lastAuthenticatedAt: 0,
  ...patch
})

it('sees a host managed account, whether it exists or is merely selected', () => {
  expect(hasManagedHostAgentAccounts({})).toBe(false)
  expect(hasManagedHostAgentAccounts({ claudeManagedAccounts: [claudeAccount()] })).toBe(true)
  expect(hasManagedHostAgentAccounts({ codexManagedAccounts: [codexAccount()] })).toBe(true)
  expect(hasManagedHostAgentAccounts({ activeClaudeManagedAccountId: 'claude-1' })).toBe(true)
  expect(
    hasManagedHostAgentAccounts({ activeCodexManagedAccountIdsByRuntime: { host: 'x', wsl: {} } })
  ).toBe(true)
})

it('ignores WSL accounts, whose credentials live inside the distro', () => {
  expect(
    hasManagedHostAgentAccounts({
      claudeManagedAccounts: [claudeAccount({ managedAuthRuntime: 'wsl' })],
      codexManagedAccounts: [codexAccount({ managedHomeRuntime: 'wsl' })]
    })
  ).toBe(false)
})

it('resolves auto to pi only on a patched Pi with no managed account', () => {
  expect(resolveAgentAuthority('auto', true, false)).toEqual({
    mode: 'pi',
    preference: 'auto',
    resolved: true
  })
  expect(resolveAgentAuthority('auto', true, true)).toEqual({
    mode: 'managed',
    preference: 'auto',
    resolved: true
  })
  expect(resolveAgentAuthority('auto', null, false)).toEqual({
    mode: 'managed',
    preference: 'auto',
    resolved: false
  })
})

it('keeps an explicit preference above both inputs', () => {
  expect(resolveAgentAuthority('pi', false, true)).toEqual({
    mode: 'pi',
    preference: 'pi',
    resolved: true
  })
  expect(resolveAgentAuthority('managed', true, false).mode).toBe('managed')
})

it('stands managed host accounts down only where Pi is the proven owner', () => {
  const auto = (mode: 'pi' | 'managed') => ({ mode, preference: 'auto' as const, resolved: true })

  expect(shouldStandDownManagedHostAccounts(auto('pi'), false)).toBe(true)
  expect(shouldStandDownManagedHostAccounts(auto('managed'), true)).toBe(false)
  // Defensive: a stale `pi` state must not disarm the accounts of a machine that has them.
  expect(shouldStandDownManagedHostAccounts(auto('pi'), true)).toBe(false)
  expect(
    shouldStandDownManagedHostAccounts({ mode: 'pi', preference: 'pi', resolved: true }, true)
  ).toBe(true)
})
