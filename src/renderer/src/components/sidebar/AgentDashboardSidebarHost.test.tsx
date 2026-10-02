// @vitest-environment happy-dom

import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import AgentDashboardSidebarHost from './AgentDashboardSidebarHost'

vi.mock('@/components/dashboard/AgentDashboardDrawer', () => ({
  AgentDashboardDrawer: () => null
}))

const initialState = useAppStore.getInitialState()

beforeEach(() => {
  useAppStore.setState({ agentDashboardDrawerOpen: false }, false)
})

afterEach(() => {
  cleanup()
  useAppStore.setState(initialState, true)
})

describe('AgentDashboardSidebarHost', () => {
  it('clears an open dashboard when the sidebar closes', async () => {
    useAppStore.setState({ agentDashboardDrawerOpen: true })
    render(<AgentDashboardSidebarHost sidebarOpen={false} statusBarVisible />)

    await waitFor(() => expect(useAppStore.getState().agentDashboardDrawerOpen).toBe(false))
  })
})
