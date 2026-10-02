import { useCallback, useEffect, useState } from 'react'
import {
  emptyMegamindChatState,
  type MegamindChatPostResult,
  type MegamindChatState,
  type MegamindMember
} from '../../../../../shared/arca-megamind-chat'

/** Chat state lives in main; the panel mirrors it and forwards the user's intent back. */
export function useMegamindChat(
  visible: boolean,
  readChannel: string | null
): {
  state: MegamindChatState
  selectChannel: (channel: string) => void
  post: (target: string, body: string) => Promise<MegamindChatPostResult>
} {
  const [state, setState] = useState<MegamindChatState>(emptyMegamindChatState)
  useEffect(() => {
    const api = window.api.arcaMegamind
    if (!api) {
      return
    }
    let disposed = false
    let sequence = 0
    const off = api.onChatState((next) => {
      sequence += 1
      if (!disposed) {
        setState(next)
      }
    })
    const snapshotSequence = sequence
    void api
      .chatState()
      .then((next) => {
        if (!disposed && sequence === snapshotSequence) {
          setState(next)
        }
      })
      .catch(noop)
    return () => {
      disposed = true
      off()
    }
  }, [])
  useEffect(() => {
    const api = window.api.arcaMegamind
    const update = (): void => {
      void api?.chatSetVisible(visible, document.hasFocus() ? readChannel : null).catch(noop)
    }
    update()
    window.addEventListener('focus', update)
    window.addEventListener('blur', update)
    return () => {
      window.removeEventListener('focus', update)
      window.removeEventListener('blur', update)
      void api?.chatSetVisible(false, null).catch(noop)
    }
  }, [visible, readChannel])
  const selectChannel = useCallback((channel: string) => {
    void window.api.arcaMegamind?.chatSelectChannel(channel).catch(noop)
  }, [])
  const post = useCallback(
    (target: string, body: string): Promise<MegamindChatPostResult> =>
      window.api.arcaMegamind.chatPost(target, body).catch(() => ({ status: 'error' }) as const),
    []
  )
  return { state, selectChannel, post }
}

export function useMegamindMembers(visible: boolean): {
  members: MegamindMember[]
  degraded: boolean
  refresh: () => void
} {
  const [members, setMembers] = useState<MegamindMember[]>([])
  const [degraded, setDegraded] = useState(false)
  const refresh = useCallback(() => {
    void window.api.arcaMegamind
      ?.members()
      .then((result) => {
        setMembers(result.items)
        setDegraded(result.degraded)
      })
      .catch(noop)
  }, [])
  useEffect(() => {
    if (!visible) {
      return
    }
    refresh()
    const timer = setInterval(refresh, 30_000)
    return () => clearInterval(timer)
  }, [refresh, visible])
  return { members, degraded, refresh }
}

function noop(): void {}
