import { describe, expect, it } from 'vitest'
import { formatClipboardFilePasteError } from './terminal-paste-errors'

describe('formatClipboardFilePasteError', () => {
  it('removes Electron and handler class prefixes from clipboard rejections', () => {
    const detail = 'The copied file reference could not be read.'
    const error = new Error(
      `Error invoking remote method 'clipboard:readFilePaths': ClipboardFilePathsError: ${detail}`
    )
    expect(formatClipboardFilePasteError(error)).toBe(`File paste failed: ${detail}`)
  })

  it('preserves a renderer-local error and non-Error rejection', () => {
    expect(formatClipboardFilePasteError(new Error('Disconnected'))).toBe(
      'File paste failed: Disconnected'
    )
    expect(formatClipboardFilePasteError('Clipboard unavailable')).toBe(
      'File paste failed: Clipboard unavailable'
    )
  })
})
