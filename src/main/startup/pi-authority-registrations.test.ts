import { expect, it, vi } from 'vitest'
import { applyPiAuthorityRegistrations } from './pi-authority-registrations'
import { registerPiAccounts, unregisterPiAccounts } from '../pi-accounts/registration'
import {
  registerPiAccountUsage,
  unregisterPiAccountUsage
} from '../pi-account-usage/registration'
import { standDownManagedHostAccountsForPiAuthority } from './main-process-account-services'

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

it('registers the Pi credential surfaces only in pi authority', () => {
  applyPiAuthorityRegistrations('pi')

  expect(registerPiAccounts).toHaveBeenCalledTimes(1)
  expect(registerPiAccountUsage).toHaveBeenCalledTimes(1)
  expect(standDownManagedHostAccountsForPiAuthority).toHaveBeenCalledTimes(1)
  expect(unregisterPiAccounts).not.toHaveBeenCalled()
})

it('tears them down and never stands managed accounts down in managed authority', () => {
  vi.clearAllMocks()
  applyPiAuthorityRegistrations('managed')

  expect(unregisterPiAccounts).toHaveBeenCalledTimes(1)
  expect(unregisterPiAccountUsage).toHaveBeenCalledTimes(1)
  expect(registerPiAccounts).not.toHaveBeenCalled()
  expect(registerPiAccountUsage).not.toHaveBeenCalled()
  expect(standDownManagedHostAccountsForPiAuthority).not.toHaveBeenCalled()
})
