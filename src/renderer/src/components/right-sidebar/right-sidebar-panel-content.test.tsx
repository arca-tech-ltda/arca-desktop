// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { RightSidebarPanelContent } from './right-sidebar-panel-content'

vi.mock('./MegamindPanel', () => ({
  default: ({ isVisible }: { isVisible: boolean }) => (
    <div data-testid="chat" data-visible={isVisible} />
  )
}))
afterEach(cleanup)

it('keeps a closed sidebar chat mounted but never readable', async () => {
  const { rerender } = render(<RightSidebarPanelContent effectiveTab="megamind" rightSidebarOpen />)
  expect((await screen.findByTestId('chat')).getAttribute('data-visible')).toBe('true')
  rerender(<RightSidebarPanelContent effectiveTab="megamind" rightSidebarOpen={false} />)
  expect(screen.getByTestId('chat').getAttribute('data-visible')).toBe('false')
})
