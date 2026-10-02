// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { startMegamindUnreadMirror } from '@/attention/megamind-unread-store'
import { RightSidebarToggle } from './TitlebarMainStrip'

const { toggle } = vi.hoisted(() => ({ toggle: vi.fn() }))
vi.mock('../store', () => ({
  useAppStore: (select: (state: { toggleRightSidebar: typeof toggle }) => unknown) =>
    select({ toggleRightSidebar: toggle })
}))
vi.mock('../hooks/useShortcutLabel', () => ({ useShortcutLabel: () => 'Ctrl+B' }))
vi.mock('../components/activity/ActivityTitlebarControls', () => ({
  ActivityTitlebarControls: () => null
}))
vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, values?: Record<string, unknown>) =>
    fallback.replace(/{{(\w+)}}/g, (_match, key: string) => String(values?.[key] ?? ''))
}))

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

it('keeps the authoritative unread count discoverable while the sidebar is collapsed', async () => {
  const stop = startMegamindUnreadMirror({
    chatState: async () => ({
      availability: 'ready',
      viewerHandle: 'biel',
      activeChannel: 'arca',
      messages: [],
      channels: [
        {
          channel: 'arca',
          kind: 'group',
          handle: '',
          name: 'ARCA',
          lastMessageAt: '',
          lastMessageBody: '',
          unread: 137
        }
      ]
    }),
    onChatState: () => () => {}
  })
  await Promise.resolve()
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () =>
      root.render(
        <TooltipProvider>
          <RightSidebarToggle />
        </TooltipProvider>
      )
    )
    const button = container.querySelector('button')
    expect(button?.getAttribute('aria-label')).toBe('Toggle right sidebar — Megamind: 137 unread')
    expect(button?.querySelector('[data-slot="badge"]')?.textContent).toBe('99+')
    expect(button?.querySelector('[data-slot="badge"]')?.getAttribute('data-size')).toBe('compact')
    await act(async () => button?.click())
    expect(toggle).toHaveBeenCalledOnce()
  } finally {
    await act(async () => root.unmount())
    container.remove()
    stop()
  }
})
