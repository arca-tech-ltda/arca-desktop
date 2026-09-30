import { describe, expect, it, vi } from 'vitest'
import { createGuardedClipboardFilePasteDeps } from './terminal-clipboard-file-paste-guard'

function createTransport(ptyId: string | null = 'pty-1', connected = true) {
  return {
    getPtyId: vi.fn(() => ptyId),
    isConnected: vi.fn(() => connected)
  }
}

type PaneListManager = { getPanes: () => { id: number; leafId: string }[] }

function createTarget(transport = createTransport()) {
  const pane = { id: 1, leafId: 'leaf-1' }
  const state: {
    manager: PaneListManager | null
    paneTransports: Map<number, ReturnType<typeof createTransport>>
  } = {
    manager: { getPanes: () => [pane] },
    paneTransports: new Map([[pane.id, transport]])
  }
  return {
    state,
    target: {
      paneId: pane.id,
      leafId: pane.leafId,
      transport,
      getManager: () => state.manager,
      getPaneTransports: () => state.paneTransports
    }
  }
}

describe('createGuardedClipboardFilePasteDeps', () => {
  it('omits both deps when the client cannot read local file references', () => {
    const { target } = createTarget()

    expect(
      createGuardedClipboardFilePasteDeps({
        readClipboardFilePaths: undefined,
        target,
        isFocusCurrent: () => true,
        deliverFilePaths: vi.fn()
      })
    ).toEqual({})
  })

  it('delivers the copied paths while the captured target is still live', async () => {
    const deliverFilePaths = vi.fn().mockResolvedValue(true)
    const { target } = createTarget()
    const deps = createGuardedClipboardFilePasteDeps({
      readClipboardFilePaths: vi.fn().mockResolvedValue(['/Users/me/a.png']),
      target,
      isFocusCurrent: () => true,
      deliverFilePaths
    })

    await expect(deps.pasteFilePaths?.(['/Users/me/a.png'])).resolves.toBe(true)
    expect(deliverFilePaths).toHaveBeenCalledWith(['/Users/me/a.png'], {
      canContinue: expect.any(Function)
    })
  })

  it('reports the delivery verdict instead of assuming success', async () => {
    const { target } = createTarget()
    const deps = createGuardedClipboardFilePasteDeps({
      readClipboardFilePaths: vi.fn(),
      target,
      isFocusCurrent: () => true,
      deliverFilePaths: vi.fn().mockResolvedValue(false)
    })

    await expect(deps.pasteFilePaths?.(['/Users/me/a.png'])).resolves.toBe(false)
  })

  it('refuses delivery when focus left the pane during the clipboard read', async () => {
    const deliverFilePaths = vi.fn()
    const { target } = createTarget()
    const deps = createGuardedClipboardFilePasteDeps({
      readClipboardFilePaths: vi.fn(),
      target,
      isFocusCurrent: () => false,
      deliverFilePaths
    })

    await expect(deps.pasteFilePaths?.(['/Users/me/a.png'])).resolves.toBe(false)
    expect(deliverFilePaths).not.toHaveBeenCalled()
  })

  it('hands delivery a canContinue that fails once focus moves after the upload', async () => {
    let focused = true
    const { target } = createTarget()
    const canContinueResults: boolean[] = []
    const deps = createGuardedClipboardFilePasteDeps({
      readClipboardFilePaths: vi.fn(),
      target,
      isFocusCurrent: () => focused,
      deliverFilePaths: async (_paths, { canContinue }) => {
        canContinueResults.push(canContinue())
        focused = false
        canContinueResults.push(canContinue())
        return false
      }
    })

    await expect(deps.pasteFilePaths?.(['/Users/me/a.png'])).resolves.toBe(false)
    expect(canContinueResults).toEqual([true, false])
  })

  it('refuses delivery when the pane went away during the clipboard read', async () => {
    const deliverFilePaths = vi.fn()
    const { state, target } = createTarget()
    const deps = createGuardedClipboardFilePasteDeps({
      readClipboardFilePaths: vi.fn(),
      target,
      isFocusCurrent: () => true,
      deliverFilePaths
    })
    state.manager = null

    await expect(deps.pasteFilePaths?.(['/Users/me/a.png'])).resolves.toBe(false)
    expect(deliverFilePaths).not.toHaveBeenCalled()
  })

  it('refuses delivery when another pane replaced the captured transport', async () => {
    const deliverFilePaths = vi.fn()
    const { state, target } = createTarget()
    const deps = createGuardedClipboardFilePasteDeps({
      readClipboardFilePaths: vi.fn(),
      target,
      isFocusCurrent: () => true,
      deliverFilePaths
    })
    state.paneTransports.set(target.paneId, createTransport())

    await expect(deps.pasteFilePaths?.(['/Users/me/a.png'])).resolves.toBe(false)
    expect(deliverFilePaths).not.toHaveBeenCalled()
  })

  it('refuses delivery when the captured pane restarted its PTY', async () => {
    const deliverFilePaths = vi.fn()
    const transport = createTransport()
    const { target } = createTarget(transport)
    const deps = createGuardedClipboardFilePasteDeps({
      readClipboardFilePaths: vi.fn(),
      target,
      isFocusCurrent: () => true,
      deliverFilePaths
    })
    transport.getPtyId.mockReturnValue('pty-restarted')

    await expect(deps.pasteFilePaths?.(['/Users/me/a.png'])).resolves.toBe(false)
    expect(deliverFilePaths).not.toHaveBeenCalled()
  })

  it('refuses delivery when the captured pane lost its PTY connection', async () => {
    const deliverFilePaths = vi.fn()
    const transport = createTransport()
    const { target } = createTarget(transport)
    const deps = createGuardedClipboardFilePasteDeps({
      readClipboardFilePaths: vi.fn(),
      target,
      isFocusCurrent: () => true,
      deliverFilePaths
    })
    transport.isConnected.mockReturnValue(false)

    await expect(deps.pasteFilePaths?.(['/Users/me/a.png'])).resolves.toBe(false)
    expect(deliverFilePaths).not.toHaveBeenCalled()
  })
})
