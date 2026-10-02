// @vitest-environment happy-dom

import { beforeEach, expect, it, vi } from 'vitest'
import { announceMegamind } from './megamind-events'
import { megamindPanelRoute } from './megamind-panel-route'

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  toast: vi.fn(),
  setActiveView: vi.fn(),
  setRightSidebarTab: vi.fn(),
  setRightSidebarOpen: vi.fn()
}))

vi.mock('sonner', () => ({ toast: mocks.toast }))
vi.mock('../store', () => ({
  useAppStore: {
    getState: () => ({
      setActiveView: mocks.setActiveView,
      setRightSidebarTab: mocks.setRightSidebarTab,
      setRightSidebarOpen: mocks.setRightSidebarOpen
    })
  }
}))
vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, values?: Record<string, unknown>) =>
    fallback.replace(/{{(\w+)}}/g, (_match, key: string) => String(values?.[key] ?? ''))
}))

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { notifications: { dispatch: mocks.dispatch } }
  })
})

function chat(id: string): Record<string, unknown> {
  return {
    kind: 'chat',
    id,
    alert: 'dm',
    channel: 'dm:aaaaaaaaaaaaaaa:bbbbbbbbbbbbbbb',
    author: 'enzo',
    body: 'Please review this change'
  }
}

it('shows one focused in-app alert and opens the exact DM only from its action', async () => {
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  mocks.dispatch.mockResolvedValue({ delivered: false, reason: 'suppressed-focus' })

  announceMegamind(chat('focused-message'))
  announceMegamind(chat('focused-message'))
  await vi.waitFor(() => expect(mocks.toast).toHaveBeenCalledTimes(1))

  expect(mocks.dispatch).toHaveBeenCalledTimes(1)
  expect(mocks.setActiveView).not.toHaveBeenCalled()
  expect(mocks.setRightSidebarTab).not.toHaveBeenCalled()
  expect(mocks.toast).toHaveBeenCalledWith('Direct message from enzo', {
    description: 'Please review this change',
    action: { label: 'Open conversation', onClick: expect.any(Function) }
  })

  const options = mocks.toast.mock.calls[0]?.[1]
  options?.action.onClick()
  expect(mocks.setActiveView).toHaveBeenCalledWith('terminal')
  expect(mocks.setRightSidebarTab).toHaveBeenCalledWith('megamind')
  expect(mocks.setRightSidebarOpen).toHaveBeenCalledWith(true)
  expect(megamindPanelRoute().requestedChannel).toBe('dm:aaaaaaaaaaaaaaa:bbbbbbbbbbbbbbb')
})

it.each(['disabled', 'source-disabled'] as const)(
  'does not replace %s native delivery with an in-app toast',
  async (reason) => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    mocks.dispatch.mockResolvedValue({ delivered: false, reason })

    announceMegamind(chat(`${reason}-message`))
    await vi.waitFor(() => expect(mocks.dispatch).toHaveBeenCalledTimes(1))
    expect(mocks.toast).not.toHaveBeenCalled()
  }
)

it('does not toast an unfocused window when system delivery is blocked', async () => {
  vi.spyOn(document, 'hasFocus').mockReturnValue(false)
  mocks.dispatch.mockResolvedValue({ delivered: false, reason: 'blocked-by-system' })

  announceMegamind(chat('blocked-background-message'))
  await vi.waitFor(() => expect(mocks.dispatch).toHaveBeenCalledTimes(1))
  expect(mocks.toast).not.toHaveBeenCalled()
})

it('does not dispatch non-personal chat records', async () => {
  vi.spyOn(document, 'hasFocus').mockReturnValue(false)
  mocks.dispatch.mockResolvedValue({ delivered: true })

  announceMegamind({ ...chat('plain-message'), alert: undefined })
  await Promise.resolve()
  expect(mocks.dispatch).not.toHaveBeenCalled()
  expect(mocks.toast).not.toHaveBeenCalled()
})
