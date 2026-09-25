// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest'
import { subscribeStatusMdChanges } from './status-md-subscription'

it('refreshes tasks on git sync even without a file event, and unsubscribes both', () => {
  const stopTasks = vi.fn()
  const stopSync = vi.fn()
  let repoUpdated: (() => void) | undefined
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      statusMdTasks: { onChanged: () => stopTasks },
      arcaProjectsSync: {
        onRepoUpdated: (callback: () => void) => {
          repoUpdated = callback
          return stopSync
        }
      }
    }
  })
  const refresh = vi.fn()
  const stop = subscribeStatusMdChanges(refresh)
  repoUpdated?.()
  expect(refresh).toHaveBeenCalledOnce()
  stop()
  expect(stopTasks).toHaveBeenCalledOnce()
  expect(stopSync).toHaveBeenCalledOnce()
})
