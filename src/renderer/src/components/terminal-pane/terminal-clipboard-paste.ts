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
  | { status: 'pasted'; kind: 'image-path' | 'text' }
  | {
      status: 'skipped'
      reason:
        | 'empty'
        | 'image-paste-failed'
        | 'image-paste-rejected'
        | 'text-paste-failed'
        | 'text-paste-rejected'
        | 'text-too-large'
    }

export async function pasteTerminalClipboard({
  readClipboardText,
  saveClipboardImageAsTempFile,
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
