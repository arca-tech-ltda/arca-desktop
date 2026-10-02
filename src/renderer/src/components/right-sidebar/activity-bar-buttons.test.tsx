// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ActivityBarButton,
  TopActivityOverflowMenu,
  type ActivityBarItem
} from './activity-bar-buttons'
import { startMegamindUnreadMirror } from '@/attention/megamind-unread-store'
import { TooltipProvider } from '@/components/ui/tooltip'

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, values?: Record<string, unknown>) =>
    fallback.replace(/{{(\w+)}}/g, (_match, key: string) => String(values?.[key] ?? ''))
}))

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const roots: ReturnType<typeof createRoot>[] = []

afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) {
      root.unmount()
    }
  })
  document.body.innerHTML = ''
})

describe('ActivityBarButton', () => {
  it('scopes the unread badge and accessible count to Megamind', async () => {
    const stop = startMegamindUnreadMirror({
      chatState: () =>
        Promise.resolve({
          availability: 'ready',
          viewerHandle: 'biel',
          activeChannel: 'arca',
          channels: [
            {
              channel: 'arca',
              kind: 'group',
              handle: '',
              name: 'ARCA',
              lastMessageAt: '',
              lastMessageBody: '',
              unread: 7
            }
          ],
          messages: []
        }),
      onChatState: () => () => {}
    })
    await Promise.resolve()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    roots.push(root)
    const icon = () => <span />

    await act(async () => {
      root.render(
        <TooltipProvider>
          <ActivityBarButton
            item={{ id: 'megamind', icon, title: 'Megamind', shortcut: '' }}
            active={false}
            onClick={vi.fn()}
            layout="top"
          />
          <ActivityBarButton
            item={{ id: 'explorer', icon, title: 'Explorer', shortcut: '' }}
            active={false}
            onClick={vi.fn()}
            layout="top"
          />
        </TooltipProvider>
      )
    })

    const buttons = container.querySelectorAll('button')
    expect(buttons[0]?.getAttribute('aria-label')).toBe('Megamind — 7 unread')
    expect(buttons[0]?.querySelector('[data-slot="badge"]')?.textContent).toBe('7')
    expect(buttons[1]?.getAttribute('aria-label')).toBe('Explorer')
    expect(buttons[1]?.querySelector('[data-slot="badge"]')).toBeNull()
    stop()
  })
})

describe('TopActivityOverflowMenu', () => {
  it('caps a hidden Megamind badge visually while announcing the actual count', async () => {
    const stop = startMegamindUnreadMirror({
      chatState: () =>
        Promise.resolve({
          availability: 'ready',
          viewerHandle: 'biel',
          activeChannel: 'arca',
          channels: [
            {
              channel: 'arca',
              kind: 'group',
              handle: '',
              name: 'ARCA',
              lastMessageAt: '',
              lastMessageBody: '',
              unread: 104
            }
          ],
          messages: []
        }),
      onChatState: () => () => {}
    })
    await Promise.resolve()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    roots.push(root)

    await act(async () => {
      root.render(
        <TopActivityOverflowMenu
          items={[{ id: 'megamind', icon: () => <span />, title: 'Megamind', shortcut: '' }]}
          activeTab="explorer"
          onSelect={vi.fn()}
        />
      )
    })

    expect(container.querySelector('button')?.getAttribute('aria-label')).toBe(
      'More sidebar tabs — 104 unread'
    )
    expect(container.querySelector('[data-slot="badge"]')?.textContent).toBe('99+')
    stop()
  })

  it('announces a hidden plugin panel error from the More button', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    roots.push(root)
    const item: ActivityBarItem = {
      id: 'plugin:orca-samples.demo/dashboard',
      icon: () => <span />,
      title: 'Demo',
      shortcut: '',
      statusIndicator: 'failure'
    }

    await act(async () => {
      root.render(
        <TopActivityOverflowMenu items={[item]} activeTab="explorer" onSelect={vi.fn()} />
      )
    })

    expect(container.querySelector('button')?.getAttribute('aria-label')).toBe(
      'More sidebar tabs — Error'
    )
  })
})
