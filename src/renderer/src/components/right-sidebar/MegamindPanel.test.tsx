// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import MegamindPanel from './MegamindPanel'
import { TooltipProvider } from '@/components/ui/tooltip'
import { routeMegamindPanel } from '@/attention/megamind-panel-route'
import type { MegamindChatState } from '../../../../shared/arca-megamind-chat'

const DM = 'dm:apa0b320to4sf22:bqr1c430up5tg33'

const chatState: MegamindChatState = {
  availability: 'ready',
  viewerHandle: 'biel',
  activeChannel: 'arca',
  channels: [
    {
      channel: 'arca',
      kind: 'group',
      handle: '',
      name: 'ARCA',
      lastMessageAt: '2026-01-01 12:52:00Z',
      lastMessageBody: 'leo: o logo da WGS tá no drive',
      unread: 2
    },
    {
      channel: DM,
      kind: 'dm',
      handle: 'enzo',
      name: 'Enzo',
      lastMessageAt: '2026-01-01 12:50:00Z',
      lastMessageBody: 'consegue olhar o deploy do wgs?',
      unread: 3
    }
  ],
  messages: [
    {
      id: 'abcdefghijklmno',
      channel: 'arca',
      authorKind: 'agent',
      authorName: 'enzo',
      authorLabel: 'sessão',
      body: 'subi o deploy, @biel confere',
      mentions: ['biel'],
      createdAt: '2026-01-01 12:30:00Z',
      mine: false
    }
  ]
}

const chatSelectChannel = vi.fn().mockResolvedValue(undefined)

beforeEach(() => {
  routeMegamindPanel({})
  Object.assign(window, {
    api: {
      arcaMegamind: {
        status: vi.fn().mockResolvedValue({ state: 'connected', device: 'mac ARCA Desktop' }),
        onUpdate: () => () => {},
        prerequisites: vi
          .fn()
          .mockResolvedValue({ mode: 'pi', agent: true, installer: true, windows: false }),
        approvals: vi.fn().mockResolvedValue({
          ok: true,
          items: [{ id: 'zzzzzzzzzzzzzzz', summary: 'git push feat/x' }]
        }),
        decide: vi.fn().mockResolvedValue('ok'),
        chatState: vi.fn().mockResolvedValue(chatState),
        onChatState: () => () => {},
        chatSetVisible: vi.fn().mockResolvedValue(undefined),
        chatSelectChannel,
        chatPost: vi.fn().mockResolvedValue({ status: 'ok', woken: [] }),
        openMainframeLogin: vi.fn(),
        members: vi.fn().mockResolvedValue({
          items: [
            {
              handle: 'enzo',
              name: 'Enzo',
              online: true,
              appOnline: false,
              sessions: [
                {
                  sessionId: 'b1c2',
                  label: 'pi mainframe@MEAN',
                  project: 'mainframe',
                  harness: 'pi',
                  note: 'revisando o gateway',
                  lastSeen: '2026-01-01 12:29:00Z',
                  status: 'active'
                }
              ]
            },
            { handle: 'leo', name: 'Leo', online: false, appOnline: true, sessions: [] }
          ],
          degraded: false
        })
      },
      arcaMainframe: { getPanel: vi.fn().mockResolvedValue(null) },
      shell: { openUrl: vi.fn() }
    }
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderPanel(): void {
  render(
    <TooltipProvider>
      <MegamindPanel />
    </TooltipProvider>
  )
}

it('shows people, the pending approval and the conversations on one screen', async () => {
  renderPanel()
  await waitFor(() => expect(screen.getByRole('button', { name: '@enzo · working' })).toBeTruthy())
  expect(screen.getByRole('button', { name: '@leo · app only' })).toBeTruthy()
  expect(screen.getByText('git push feat/x')).toBeTruthy()
  const group = screen.getByRole('button', { name: /# arca/ })
  expect(group.textContent).toContain('leo: o logo da WGS tá no drive')
  expect(group.textContent).toContain('2')
  expect(screen.getByRole('button', { name: /Enzo/ }).textContent).toContain(
    'consegue olhar o deploy do wgs?'
  )
  // No tabs and no setup noise while the connection and the prerequisites are in order.
  expect(screen.queryAllByRole('tab')).toEqual([])
  expect(screen.queryByText(/Connected as/)).toBeNull()
})

it('opens the DM when a person is tapped, and comes back to the list', async () => {
  renderPanel()
  await userEvent.click(await screen.findByRole('button', { name: '@enzo · working' }))
  expect(chatSelectChannel).toHaveBeenCalledWith(DM)
  expect(screen.getByLabelText('Message @enzo')).toBeTruthy()
  expect(screen.getByText('mainframe · pi')).toBeTruthy()
  await userEvent.click(screen.getByRole('button', { name: 'Back to conversations' }))
  expect(screen.getByRole('button', { name: /# arca/ })).toBeTruthy()
})

it('opens the conversation a notification asked for', async () => {
  routeMegamindPanel({ channel: DM })
  renderPanel()
  await waitFor(() => expect(chatSelectChannel).toHaveBeenCalledWith(DM))
  expect(screen.getByLabelText('Message @enzo')).toBeTruthy()
})

it('decides a pending approval from its card', async () => {
  renderPanel()
  await userEvent.click(await screen.findByRole('button', { name: 'Approve' }))
  await waitFor(() =>
    expect(window.api.arcaMegamind.decide).toHaveBeenCalledWith('zzzzzzzzzzzzzzz', 'approved')
  )
})

it('names the connected device behind the setup button', async () => {
  renderPanel()
  await userEvent.click(await screen.findByRole('button', { name: 'Connection and setup' }))
  expect(screen.getByText(/Connected as/).textContent).toContain('mac ARCA Desktop')
})
