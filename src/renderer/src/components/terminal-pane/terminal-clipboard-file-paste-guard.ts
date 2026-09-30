import {
  isTerminalPanePasteTargetCurrent,
  type TerminalPasteTargetState
} from './terminal-paste-target-state'

type ClipboardFilePasteTarget = {
  paneId: number
  leafId: string
  transport: TerminalPasteTargetState['transport']
  getManager: () => TerminalPasteTargetState['manager']
  getPaneTransports: () => TerminalPasteTargetState['paneTransports'] | null
}

export type TerminalClipboardFilePasteDeps = {
  readClipboardFilePaths?: () => Promise<string[]>
  pasteFilePaths?: (paths: string[]) => Promise<boolean>
}

/**
 * Bind the clipboard file-reference deps of `pasteTerminalClipboard` to one
 * paste target, refusing delivery if that target or its focus moved while the
 * clipboard was being read. Both deps are omitted when the client cannot read
 * local file references, which leaves the image and text paste paths untouched.
 */
export function createGuardedClipboardFilePasteDeps({
  readClipboardFilePaths,
  target,
  isFocusCurrent,
  deliverFilePaths
}: {
  readClipboardFilePaths: (() => Promise<string[]>) | undefined
  target: ClipboardFilePasteTarget
  /** Bound by the caller to the focus state captured at event dispatch. */
  isFocusCurrent: () => boolean
  deliverFilePaths: (
    paths: string[],
    options: { canContinue: () => boolean }
  ) => Promise<boolean> | boolean
}): TerminalClipboardFilePasteDeps {
  if (!readClipboardFilePaths) {
    return {}
  }
  // Why: the PTY the pane runs now is what a later delivery would reach, so it
  // is captured with the pane and re-checked after the async clipboard read.
  const ptyId = target.transport?.getPtyId() ?? null
  const isTargetCurrent = (): boolean => {
    const paneTransports = target.getPaneTransports()
    if (
      !paneTransports ||
      !isTerminalPanePasteTargetCurrent({
        manager: target.getManager(),
        paneTransports,
        paneId: target.paneId,
        leafId: target.leafId,
        transport: target.transport,
        ptyId
      })
    ) {
      return false
    }
    return isFocusCurrent()
  }
  return {
    readClipboardFilePaths,
    pasteFilePaths: async (paths: string[]): Promise<boolean> => {
      if (!isTargetCurrent()) {
        return false
      }
      // Why: uploads run long, so delivery re-checks the same guard before it
      // writes into the PTY.
      return await deliverFilePaths(paths, { canContinue: isTargetCurrent })
    }
  }
}
