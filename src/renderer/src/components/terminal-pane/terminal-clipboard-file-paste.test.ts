import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handleTerminalFileDrop: vi.fn(),
  toastError: vi.fn()
}))

vi.mock('sonner', () => ({ toast: { error: mocks.toastError } }))

vi.mock('./terminal-drop-handler', () => ({
  handleTerminalFileDrop: mocks.handleTerminalFileDrop
}))

vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))

import { NATIVE_FILE_DROP_MAX_PATHS } from '../../../../shared/native-file-drop'
import { createTerminalClipboardFilePasteDeps } from './terminal-clipboard-file-paste'

// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: these test doubles implement only the members the paste deps read.
const asPasteArg = <T>(value: unknown): T => value as T

function createContext(cwd: string | undefined) {
  const pane = { id: 1, leafId: 'leaf-1', container: {} }
  const transport = { getPtyId: () => 'pty-1', isConnected: () => true }
  const paneTransports = new Map([[pane.id, transport]])
  return {
    pane,
    context: {
      cwdRef: { current: cwd },
      managerRef: { current: { getPanes: () => [pane] } },
      paneTransportsRef: { current: paneTransports },
      tabId: 'tab-1',
      worktreeId: 'wt-1'
    }
  }
}

function createDeps(cwd: string | undefined = '/worktree') {
  const { context, pane } = createContext(cwd)
  return createTerminalClipboardFilePasteDeps(
    asPasteArg<Parameters<typeof createTerminalClipboardFilePasteDeps>[0]>(context),
    asPasteArg<Parameters<typeof createTerminalClipboardFilePasteDeps>[1]>(pane),
    // Focus is checked by the guard; this suite covers the delivery wiring.
    { requireSameFocusedElement: false, activeElementAtDispatch: null }
  )
}

describe('createTerminalClipboardFilePasteDeps', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.handleTerminalFileDrop.mockResolvedValue(true)
    vi.stubGlobal('window', { api: { ui: { readClipboardFilePaths: vi.fn() } } })
  })

  it('delivers copied paths through the drop flow with the live pane cwd', async () => {
    const deps = createDeps('/worktree')

    await expect(deps.pasteFilePaths?.(['/Users/me/a.png'])).resolves.toBe(true)
    expect(mocks.handleTerminalFileDrop).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: '/worktree',
        tabId: 'tab-1',
        worktreeId: 'wt-1',
        canContinue: expect.any(Function),
        data: {
          paths: ['/Users/me/a.png'],
          target: 'terminal',
          tabId: 'tab-1',
          paneLeafId: 'leaf-1'
        }
      })
    )
  })

  it('reports the drop flow verdict instead of assuming the paste landed', async () => {
    mocks.handleTerminalFileDrop.mockResolvedValue(false)

    await expect(createDeps().pasteFilePaths?.(['/Users/me/a.png'])).resolves.toBe(false)
  })

  it('refuses an oversized clipboard list whole instead of pasting part of it', async () => {
    const paths = Array.from({ length: NATIVE_FILE_DROP_MAX_PATHS + 1 }, (_, i) => `/tmp/${i}.txt`)

    await expect(createDeps().pasteFilePaths?.(paths)).resolves.toBe(false)
    expect(mocks.handleTerminalFileDrop).not.toHaveBeenCalled()
    expect(mocks.toastError).toHaveBeenCalledWith(
      'Drop contains too many paths for a safe terminal paste.'
    )
  })

  it('refuses a clipboard list whose paths exceed the byte limit', async () => {
    const paths = [`/tmp/${'a'.repeat(256 * 1024)}.txt`]

    await expect(createDeps().pasteFilePaths?.(paths)).resolves.toBe(false)
    expect(mocks.handleTerminalFileDrop).not.toHaveBeenCalled()
    expect(mocks.toastError).toHaveBeenCalledWith(
      'Drop path list is too large for a safe terminal paste.'
    )
  })
})
