import {
  isClipboardTextTooLargeError,
  type ReadClipboardTextOptions
} from '../../../../shared/clipboard-text'
import { isWebClientLocation } from '@/lib/web-client-location'
import {
  TERMINAL_PASTE_MAX_BYTES,
  type TerminalPasteTextOptions
} from './terminal-paste-coordinator'

type SaveClipboardImageAsTempFile = (args?: {
  connectionId?: string | null
  runtimeEnvironmentId?: string | null
}) => Promise<string | null>

type PasteTerminalClipboardDeps = {
  readClipboardText: (options?: ReadClipboardTextOptions) => Promise<string>
  saveClipboardImageAsTempFile: SaveClipboardImageAsTempFile
  /** Both absent (old client / web) => the image and text paths behave as before. */
  readClipboardFilePaths?: () => Promise<string[]>
  pasteFilePaths?: (paths: string[]) => boolean | void | Promise<boolean | void>
  onFilePathsPasteError?: (error: unknown) => void
  pasteText: (
    text: string,
    options?: TerminalPasteTextOptions
  ) => boolean | void | Promise<boolean | void>
  connectionId?: string | null
  runtimeEnvironmentId?: string | null
  forceBracketedMultilineTextPaste?: boolean
  protectedMultilineTextPasteOptions?: TerminalPasteTextOptions
  onTextPasteError?: (error: unknown) => void
  onImagePasteError?: (error: unknown) => void
  preferImage?: boolean
}

export type TerminalClipboardPasteResult =
  | { status: 'pasted'; kind: 'file-paths' | 'image-path' | 'text' }
  | {
      status: 'skipped'
      reason:
        | 'empty'
        | 'file-paths-paste-failed'
        | 'file-paths-paste-rejected'
        | 'image-paste-failed'
        | 'image-paste-rejected'
        | 'text-paste-failed'
        | 'text-paste-rejected'
        | 'text-too-large'
    }

export async function pasteTerminalClipboard({
  readClipboardText,
  saveClipboardImageAsTempFile,
  readClipboardFilePaths,
  pasteFilePaths,
  onFilePathsPasteError,
  pasteText,
  connectionId,
  runtimeEnvironmentId,
  forceBracketedMultilineTextPaste = false,
  protectedMultilineTextPasteOptions,
  onTextPasteError,
  onImagePasteError,
  // Why: GarimeCapture includes OCR text with its image; browsers need the independent text-read permission path.
  preferImage = !isWebClientLocation()
}: PasteTerminalClipboardDeps): Promise<TerminalClipboardPasteResult> {
  const pasteImage = async (): Promise<TerminalClipboardPasteResult | null> => {
    try {
      const filePath = await saveClipboardImageAsTempFile({ connectionId, runtimeEnvironmentId })
      if (!filePath) {
        return null
      }
      const result = await pasteText(filePath, {
        // Why: a generated clipboard-image path is terminal image injection, not
        // ordinary one-line text. Keep it off the Ctrl+C stale-text paste path.
        forceBracketedPaste: true,
        recoverImagePasteWebglAtlas: true
      })
      if (result === false) {
        return { status: 'skipped', reason: 'image-paste-rejected' }
      }
      return { status: 'pasted', kind: 'image-path' }
    } catch (error) {
      onImagePasteError?.(error)
      return { status: 'skipped', reason: 'image-paste-failed' }
    }
  }

  // Why: copying a file in Finder/Explorer also publishes its icon as a clipboard
  // image, so the file reference must win before the image branch turns the copy
  // into an icon screenshot (the drop flow then handles SSH/runtime/WSL targets).
  if (readClipboardFilePaths && pasteFilePaths) {
    let filePaths: string[]
    try {
      filePaths = await readClipboardFilePaths()
    } catch (error) {
      onFilePathsPasteError?.(error)
      return { status: 'skipped', reason: 'file-paths-paste-failed' }
    }
    if (filePaths.length > 0) {
      try {
        const result = await pasteFilePaths(filePaths)
        return result === false
          ? { status: 'skipped', reason: 'file-paths-paste-rejected' }
          : { status: 'pasted', kind: 'file-paths' }
      } catch (error) {
        onFilePathsPasteError?.(error)
        return { status: 'skipped', reason: 'file-paths-paste-failed' }
      }
    }
  }

  if (preferImage) {
    const imageResult = await pasteImage()
    if (imageResult) {
      return imageResult
    }
  }

  let text = ''
  try {
    text = await readClipboardText({ maxBytes: TERMINAL_PASTE_MAX_BYTES })
  } catch (error) {
    if (isClipboardTextTooLargeError(error)) {
      onTextPasteError?.(error)
      return { status: 'skipped', reason: 'text-too-large' }
    }
    return preferImage
      ? { status: 'skipped', reason: 'empty' }
      : ((await pasteImage()) ?? { status: 'skipped', reason: 'empty' })
  }
  if (!text) {
    return preferImage
      ? { status: 'skipped', reason: 'empty' }
      : ((await pasteImage()) ?? { status: 'skipped', reason: 'empty' })
  }

  try {
    const textOptions =
      protectedMultilineTextPasteOptions ??
      (forceBracketedMultilineTextPaste ? { forceBracketedPasteForMultiline: true } : undefined)
    const result = await (textOptions ? pasteText(text, textOptions) : pasteText(text))
    if (result === false) {
      return { status: 'skipped', reason: 'text-paste-rejected' }
    }
    return { status: 'pasted', kind: 'text' }
  } catch (error) {
    onTextPasteError?.(error)
    return { status: 'skipped', reason: 'text-paste-failed' }
  }
}
