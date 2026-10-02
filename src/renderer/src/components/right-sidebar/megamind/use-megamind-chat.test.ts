// @vitest-environment happy-dom
import { act, renderHook, cleanup } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import {
  emptyMegamindChatState,
  type MegamindChatState
} from '../../../../../shared/arca-megamind-chat'
import { useMegamindChat } from './use-megamind-chat'

afterEach(cleanup)

it('ignores an initial snapshot overtaken by a push and callbacks after disposal', async () => {
  let push: (state: MegamindChatState) => void = () => {}
  let resolve: (state: MegamindChatState) => void = () => {}
  const off = vi.fn()
  Object.assign(window, {
    api: {
      arcaMegamind: {
        onChatState: (listener: typeof push) => {
          push = listener
          return off
        },
        chatState: () =>
          new Promise<MegamindChatState>((done) => {
            resolve = done
          }),
        chatSetVisible: vi.fn().mockResolvedValue(undefined)
      }
    }
  })
  const { result, unmount } = renderHook(() => useMegamindChat(true, 'arca'))
  const newer = { ...emptyMegamindChatState(), viewerHandle: 'new' }
  act(() => push(newer))
  await act(async () => resolve(emptyMegamindChatState()))
  expect(result.current.state).toEqual(newer)
  unmount()
  act(() => push(emptyMegamindChatState()))
  expect(off).toHaveBeenCalledOnce()
  expect(result.current.state).toEqual(newer)
})
