import { expect, it, vi } from 'vitest'
import { applyAgentAuthorityRegistrations } from './agent-authority-registrations'
import { registerPiAccounts, unregisterPiAccounts } from '../pi-accounts/registration'
import { registerPiAccountUsage, unregisterPiAccountUsage } from '../pi-account-usage/registration'
import { standDownManagedHostAccountsForPiAuthority } from './main-process-account-services'
import {
  registerManagedAccountProjects,
  unregisterManagedAccountProjects
} from '../managed-account-projects/registration'

vi.mock('../pi-accounts/registration', () => ({
  registerPiAccounts: vi.fn(),
  unregisterPiAccounts: vi.fn()
}))
vi.mock('../pi-account-usage/registration', () => ({
  registerPiAccountUsage: vi.fn(),
  unregisterPiAccountUsage: vi.fn()
}))
vi.mock('./main-process-account-services', () => ({
  standDownManagedHostAccountsForPiAuthority: vi.fn()
}))
vi.mock('../managed-account-projects/registration', () => ({
  registerManagedAccountProjects: vi.fn(),
  unregisterManagedAccountProjects: vi.fn()
}))

const settings = { getSettings: () => ({ claudeManagedAccounts: [], codexManagedAccounts: [] }) }

it('registers the Pi credential surfaces only in pi authority', () => {
  applyAgentAuthorityRegistrations('pi', settings)

  expect(registerPiAccounts).toHaveBeenCalledTimes(1)
  expect(registerPiAccountUsage).toHaveBeenCalledTimes(1)
  expect(standDownManagedHostAccountsForPiAuthority).toHaveBeenCalledTimes(1)
  expect(unregisterPiAccounts).not.toHaveBeenCalled()
  expect(unregisterManagedAccountProjects).toHaveBeenCalledTimes(1)
  expect(registerManagedAccountProjects).not.toHaveBeenCalled()
})

it('tears them down and never stands managed accounts down in managed authority', () => {
  vi.clearAllMocks()
  applyAgentAuthorityRegistrations('managed', settings)

  expect(unregisterPiAccounts).toHaveBeenCalledTimes(1)
  expect(unregisterPiAccountUsage).toHaveBeenCalledTimes(1)
  expect(registerPiAccounts).not.toHaveBeenCalled()
  expect(registerPiAccountUsage).not.toHaveBeenCalled()
  expect(standDownManagedHostAccountsForPiAuthority).not.toHaveBeenCalled()
  expect(registerManagedAccountProjects).toHaveBeenCalledTimes(1)
})
