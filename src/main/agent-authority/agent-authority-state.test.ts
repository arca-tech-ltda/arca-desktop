import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { GlobalSettings } from '../../shared/global-settings-types'
import {
  getAgentAuthorityMode,
  getAgentAuthorityState,
  onAgentAuthorityChanged,
  refreshAgentAuthority,
  resetAgentAuthorityForTest,
  startAgentAuthority
} from './agent-authority-state'
import { resetPiAccountSelectionSupportForTest } from '../pi-accounts/pi-account-selection-support'

const probe = vi.hoisted(() => ({ supported: false }))
vi.mock('../pi-accounts/pi-account-capabilities-probe', () => ({
  probePiAccountEnvSupport: () => Promise.resolve(probe.supported)
}))

type SettingsListener = (updates: Partial<GlobalSettings>) => void

function settingsSource(initial: GlobalSettings['agentAuthority']) {
  let value = initial
  const listeners = new Set<SettingsListener>()
  return {
    source: {
      getSettings: () => ({ agentAuthority: value }),
      onSettingsChanged: (listener: SettingsListener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      }
    },
    set(next: GlobalSettings['agentAuthority']) {
      value = next
      for (const listener of listeners) {
        listener({ agentAuthority: next })
      }
    }
  }
}

beforeEach(() => {
  vi.stubEnv('ARCA_FORCE_PI_ACCOUNT_SUPPORT', '')
  probe.supported = false
})

afterEach(() => {
  vi.unstubAllEnvs()
  resetAgentAuthorityForTest()
  resetPiAccountSelectionSupportForTest()
})

it('stays managed and unresolved until the Pi capability probe answers', async () => {
  const settings = settingsSource('auto')
  const stop = startAgentAuthority(settings.source)

  expect(getAgentAuthorityState()).toEqual({
    mode: 'managed',
    preference: 'auto',
    resolved: false
  })

  // Settles the probe started by `startAgentAuthority` before asking again with Pi present.
  await refreshAgentAuthority()
  probe.supported = true
  await refreshAgentAuthority()

  expect(getAgentAuthorityState()).toEqual({ mode: 'pi', preference: 'auto', resolved: true })
  stop()
})

it('reports managed once a machine without a patched Pi has been probed', async () => {
  const settings = settingsSource('auto')
  const stop = startAgentAuthority(settings.source)

  await refreshAgentAuthority()

  expect(getAgentAuthorityState()).toEqual({
    mode: 'managed',
    preference: 'auto',
    resolved: true
  })
  stop()
})

it('lets the explicit setting win over the probe, in both directions', async () => {
  const settings = settingsSource('managed')
  const stop = startAgentAuthority(settings.source)
  await refreshAgentAuthority()
  probe.supported = true
  await refreshAgentAuthority()

  expect(getAgentAuthorityMode()).toBe('managed')

  probe.supported = false
  settings.set('pi')

  expect(getAgentAuthorityState()).toEqual({ mode: 'pi', preference: 'pi', resolved: true })
  stop()
})

it('follows a Pi that appears after startup and notifies listeners once per change', async () => {
  const settings = settingsSource('auto')
  const seen: string[] = []
  const stopListener = onAgentAuthorityChanged((state) => seen.push(state.mode))
  const stop = startAgentAuthority(settings.source)
  await refreshAgentAuthority()

  probe.supported = true
  await refreshAgentAuthority()

  expect(getAgentAuthorityMode()).toBe('pi')
  // The first change is the probe answering managed; the second is Pi showing up.
  expect(seen).toEqual(['managed', 'pi'])
  stopListener()
  stop()
})
