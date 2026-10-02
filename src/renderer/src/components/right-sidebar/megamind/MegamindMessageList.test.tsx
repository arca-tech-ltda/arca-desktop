// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import type { MegamindChatMessage } from '../../../../../shared/arca-megamind-chat'
import { MegamindMessageList } from './MegamindMessageList'

const message = (id: string, body: string): MegamindChatMessage => ({
  id,
  channel: 'arca',
  authorKind: 'human',
  authorName: 'enzo',
  authorLabel: '',
  body,
  mentions: [],
  createdAt: '2026-01-01 12:00:00Z',
  mine: false
})

afterEach(cleanup)

it('starts a channel at the bottom and shows new messages without moving a reader', () => {
  let scrollHeight = 400
  Object.defineProperties(HTMLElement.prototype, {
    scrollHeight: { configurable: true, get: () => scrollHeight },
    clientHeight: { configurable: true, get: () => 100 }
  })
  const rendered = render(
    <MegamindMessageList
      channel="arca"
      messages={[message('one', 'first')]}
      viewerHandle="biel"
      emptyText="empty"
    />
  )
  const list = screen.getByTestId('megamind-message-list')
  expect(list.scrollTop).toBe(400)

  list.scrollTop = 100
  fireEvent.scroll(list)
  scrollHeight = 500
  rendered.rerender(
    <MegamindMessageList
      channel="arca"
      messages={[message('one', 'first'), message('two', 'second')]}
      viewerHandle="biel"
      emptyText="empty"
    />
  )
  expect(list.scrollTop).toBe(100)
  expect(screen.getByRole('button', { name: 'New messages' })).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: 'New messages' }))
  expect(list.scrollTop).toBe(500)
  expect(screen.queryByRole('button', { name: 'New messages' })).toBeNull()
})

it('scrolls to the bottom when the channel changes, even when the last id is reused', () => {
  let scrollHeight = 300
  Object.defineProperties(HTMLElement.prototype, {
    scrollHeight: { configurable: true, get: () => scrollHeight },
    clientHeight: { configurable: true, get: () => 100 }
  })
  const rendered = render(
    <MegamindMessageList
      channel="arca"
      messages={[message('same-id', 'group')]}
      viewerHandle="biel"
      emptyText="empty"
    />
  )
  const list = screen.getByTestId('megamind-message-list')
  list.scrollTop = 20
  fireEvent.scroll(list)
  scrollHeight = 600
  rendered.rerender(
    <MegamindMessageList
      channel="dm:enzo"
      messages={[message('same-id', 'private')]}
      viewerHandle="biel"
      emptyText="empty"
    />
  )
  expect(list.scrollTop).toBe(600)
})
