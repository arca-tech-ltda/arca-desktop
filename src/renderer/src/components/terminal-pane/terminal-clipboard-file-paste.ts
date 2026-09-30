import { toast } from 'sonner'
import type { PaneManager } from '@/lib/pane-manager/pane-manager'
import {
  NATIVE_FILE_DROP_TARGET,
  validateNativeFileDropPaths
} from '../../../../shared/native-file-drop'
import type { PtyTransport } from './pty-transport'
import {
  createGuardedClipboardFilePasteDeps,
  type TerminalClipboardFilePasteDeps
} from './terminal-clipboard-file-paste-guard'
import { handleTerminalFileDrop } from './terminal-drop-handler'
import { getTerminalInternalFileDropRejectionMessage } from './terminal-drop-internal-rejection-message'
import { isTerminalPanePasteFocusCurrent } from './terminal-paste-target-state'

/** Focus state captured at event dispatch, before the async clipboard read. */
export type ClipboardFilePasteFocus = {
  requireSameFocusedElement: boolean
  activeElementAtDispatch: Element | null
}

export type TerminalClipboardFilePasteContext = {
  managerRef: React.RefObject<PaneManager | null>
  paneTransportsRef: React.RefObject<Map<number, PtyTransport>>
  tabId: string
  worktreeId: string
  /** Live pane cwd, matching the native drop fallback. */
  cwdRef: React.RefObject<string | undefined>
}

/**
 * Clipboard-file-reference deps for `pasteTerminalClipboard`, shared by every
 * paste entry point (keyboard, paste event, app menu, context menu).
 *
 * Delivery reuses the native drop flow, so a pasted file follows the same
 * local / SSH-upload / runtime / WSL routing and the same shell quoting as a
 * dropped one. See docs/reference/clipboard-file-paste.md.
 */
export function createTerminalClipboardFilePasteDeps(
  context: TerminalClipboardFilePasteContext,
  pane: { id: number; leafId: string; container: Element },
  focus: ClipboardFilePasteFocus
): TerminalClipboardFilePasteDeps {
  return createGuardedClipboardFilePasteDeps({
    readClipboardFilePaths: window.api.ui.readClipboardFilePaths,
    target: {
      paneId: pane.id,
      leafId: pane.leafId,
      transport: context.paneTransportsRef.current?.get(pane.id),
      getManager: () => context.managerRef.current,
      getPaneTransports: () => context.paneTransportsRef.current
    },
    isFocusCurrent: () =>
      isTerminalPanePasteFocusCurrent({ ...focus, paneContainer: pane.container }),
    deliverFilePaths: async (paths, { canContinue }): Promise<boolean> => {
      // Why: a clipboard list can be far larger than a drop, and a partial
      // paste would write half a command line, so oversized lists are refused
      // whole under the same limits the native drop payload uses.
      const validation = validateNativeFileDropPaths(paths)
      if (validation.status === 'rejected') {
        toast.error(getTerminalInternalFileDropRejectionMessage(validation.reason))
        return false
      }
      const manager = context.managerRef.current
      const paneTransports = context.paneTransportsRef.current
      if (!manager || !paneTransports) {
        return false
      }
      return await handleTerminalFileDrop({
        manager,
        paneTransports,
        worktreeId: context.worktreeId,
        tabId: context.tabId,
        cwd: context.cwdRef.current,
        canContinue,
        data: {
          paths,
          target: NATIVE_FILE_DROP_TARGET.terminal,
          tabId: context.tabId,
          paneLeafId: pane.leafId
        }
      })
    }
  })
}
