// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import MegamindPanel from './MegamindPanel'
import { routeMegamindPanel } from '@/attention/megamind-panel-route'
import type { MegamindChatState } from '../../../../shared/arca-megamind-chat'

const DM = 'dm:apa0b320to4sf22:bqr1c430up5tg33'

const chatState: MegamindChatState = {
  availability: 'ready',
  viewerHandle: 'biel',
  activeChannel: 'arca',
  channels: [
    { channel: 'arca', kind: 'group', handle: '', name: 'ARCA', lastMessageAt: '', unread: 0 },
    {
      channel: DM,
      kind: 'dm',
      handle: 'enzo',
      name: 'Enzo',
      lastMessageAt: '2026-01-01',
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
      createdAt: '2026-01-01T12:30:00Z',
      mine: false
    }
  ]
}

const chatSelectChannel = vi.fn().mockResolvedValue(undefined)

beforeEach(() => {
  routeMegamindPanel({ tab: 'chat' })
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
                  label: 'sessão',
                  project: 'mainframe',
                  harness: 'pi',
                  note: 'revisando o gateway',
                  lastSeen: '2026-01-01T12:29:00Z'
                }
              ]
            }
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

it('opens on the chat, showing the channel strip, the agent badge and the viewer’s mention', async () => {
  render(<MegamindPanel />)
  await waitFor(() => expect(screen.getByText('# arca')).toBeTruthy())
  expect(screen.getByRole('button', { name: /@enzo/ }).textContent).toContain('3')
  expect(screen.getByText('agent')).toBeTruthy()
  expect(screen.getByText('@biel').className).toContain('bg-primary/20')
  expect(screen.getByText(/Connected as/).textContent).toContain('mac ARCA Desktop')
})

it('switches to presence and hands the DM back to the chat tab', async () => {
  render(<MegamindPanel />)
  await userEvent.click(await screen.findByRole('tab', { name: 'Presence' }))
  await waitFor(() => expect(screen.getByText('revisando o gateway')).toBeTruthy())
  await userEvent.click(screen.getByRole('button', { name: 'Message' }))
  expect(chatSelectChannel).toHaveBeenCalledWith(DM)
  await waitFor(() =>
    expect(screen.getByRole('tab', { name: /Chat/ }).dataset.state).toBe('active')
  )
})

it('counts pending approvals on its tab and decides one', async () => {
  render(<MegamindPanel />)
  const tab = await screen.findByRole('tab', { name: /Approvals/ })
  await waitFor(() => expect(tab.textContent).toBe('Approvals1'))
  await userEvent.click(tab)
  await userEvent.click(await screen.findByRole('button', { name: 'Approve' }))
  await waitFor(() =>
    expect(window.api.arcaMegamind.decide).toHaveBeenCalledWith('zzzzzzzzzzzzzzz', 'approved')
  )
})
