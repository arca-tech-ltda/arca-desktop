import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const updaterCalls = vi.hoisted(() => ({
  checkForUpdatesFromMenu: vi.fn(),
  setupAutoUpdater: vi.fn()
}))

vi.mock('./updater-setup', () => ({
  UpdaterSetup: class {
    checkForUpdatesFromMenu = updaterCalls.checkForUpdatesFromMenu
    setupAutoUpdater = updaterCalls.setupAutoUpdater
  }
}))

import {
  checkForUpdatesFromMenu,
  getUpdateStatus,
  setupAutoUpdater
} from '../updater'
import { AUTO_UPDATES_TEST_OVERRIDE_ENV, areAutoUpdatesEnabled } from './auto-update-policy'

const previousOverride = process.env[AUTO_UPDATES_TEST_OVERRIDE_ENV]

describe('ARCA auto-update policy', () => {
  beforeEach(() => {
    delete process.env[AUTO_UPDATES_TEST_OVERRIDE_ENV]
    vi.clearAllMocks()
  })

  afterEach(() => {
    if (previousOverride === undefined) {
      delete process.env[AUTO_UPDATES_TEST_OVERRIDE_ENV]
    } else {
      process.env[AUTO_UPDATES_TEST_OVERRIDE_ENV] = previousOverride
    }
  })

  it('disables inherited update checks unless the test override is set', () => {
    expect(areAutoUpdatesEnabled()).toBe(false)
    process.env[AUTO_UPDATES_TEST_OVERRIDE_ENV] = '1'
    expect(areAutoUpdatesEnabled()).toBe(true)
    expect(
      areAutoUpdatesEnabled({ NODE_ENV: 'production', [AUTO_UPDATES_TEST_OVERRIDE_ENV]: '1' })
    ).toBe(false)
  })

  it('settles a menu check without invoking the inherited updater', () => {
    const send = vi.fn()
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: The policy boundary only reads this BrowserWindow subset.
    setupAutoUpdater({ isDestroyed: () => false, webContents: { send } } as never)

    checkForUpdatesFromMenu()

    expect(updaterCalls.setupAutoUpdater).not.toHaveBeenCalled()
    expect(updaterCalls.checkForUpdatesFromMenu).not.toHaveBeenCalled()
    expect(getUpdateStatus()).toEqual({ state: 'not-available', userInitiated: true })
    expect(send).toHaveBeenCalledWith('updater:status', {
      state: 'not-available',
      userInitiated: true
    })
  })
})
