import { describe, expect, it, vi } from 'vitest'
import {
  ClipboardFilePathsError,
  decodeClipboardFilePaths,
  readClipboardFilePaths,
  type ClipboardFilePathFormats
} from './clipboard-file-paths'
import { NATIVE_FILE_DROP_MAX_PATHS } from '../../shared/native-file-drop'

// Real `plistlib.dumps([...], fmt=FMT_BINARY)` output for two absolute paths.
const BINARY_PLIST_TWO_PATHS =
  'YnBsaXN0MDCiAQJfEA8vVXNlcnMvbWUvYS5wbmdfEBEvVXNlcnMvbWUvYiBjLnR4dAgLHQAAAAAAAAEBAAAAAAAAAAMAAAAAAAAAAAAAAAAAAAAx'

function utf8(value: string): Buffer {
  return Buffer.from(value, 'utf8')
}

function binaryPlist(): Buffer {
  return Buffer.from(BINARY_PLIST_TWO_PATHS, 'base64')
}

function fileNameW(filePath: string): Buffer {
  return Buffer.from(`${filePath}\0`, 'utf16le')
}

function shellIdListArray(itemCount: number): Buffer {
  const buffer = Buffer.alloc(4 + 4 * (itemCount + 1))
  buffer.writeUInt32LE(itemCount)
  return buffer
}

function xmlPlist(paths: string[]): Buffer {
  return utf8(
    `<?xml version="1.0"?><plist version="1.0"><array>${paths
      .map((path) => `<string>${path}</string>`)
      .join('')}</array></plist>`
  )
}

function captureRejection(
  platform: NodeJS.Platform,
  formats: ClipboardFilePathFormats
): ClipboardFilePathsError {
  try {
    decodeClipboardFilePaths(platform, formats)
  } catch (error) {
    if (!(error instanceof ClipboardFilePathsError)) {
      throw error
    }
    return error
  }
  throw new Error('expected decodeClipboardFilePaths to reject')
}

function rejection(platform: NodeJS.Platform, formats: ClipboardFilePathFormats): string {
  return captureRejection(platform, formats).reason
}

describe('decodeClipboardFilePaths on macOS', () => {
  it('decodes a single copied file from public.file-url', () => {
    expect(
      decodeClipboardFilePaths('darwin', {
        darwinFileUrl: utf8('file:///Users/me/ARCA/lista%20ARCA.pdf')
      })
    ).toEqual(['/Users/me/ARCA/lista ARCA.pdf'])
  })

  it('decodes the full list from an XML NSFilenamesPboardType plist', () => {
    expect(
      decodeClipboardFilePaths('darwin', {
        darwinFileUrl: utf8('file:///Users/me/a.png'),
        darwinFileNamesPlist: xmlPlist(['/Users/me/a.png', '/Users/me/b &amp; c.png'])
      })
    ).toEqual(['/Users/me/a.png', '/Users/me/b & c.png'])
  })

  it('decodes the full list from a binary NSFilenamesPboardType plist', () => {
    expect(
      decodeClipboardFilePaths('darwin', {
        darwinFileUrl: utf8('file:///Users/me/a.png'),
        darwinFileNamesPlist: binaryPlist()
      })
    ).toEqual(['/Users/me/a.png', '/Users/me/b c.txt'])
  })

  it('refuses an unreadable plist instead of pasting the first file alone', () => {
    const truncated = binaryPlist().subarray(0, 40)

    expect(
      rejection('darwin', {
        darwinFileUrl: utf8('file:///Users/me/a.png'),
        darwinFileNamesPlist: truncated
      })
    ).toBe('unreadable-file-reference')
  })

  it('refuses a plist holding more paths than a drop accepts', () => {
    const paths = Array.from(
      { length: NATIVE_FILE_DROP_MAX_PATHS + 1 },
      (_unused, index) => `/Users/me/f${index}.png`
    )

    expect(rejection('darwin', { darwinFileNamesPlist: xmlPlist(paths) })).toBe('too-many-files')
  })

  it('refuses non-file URLs, relative paths and control characters', () => {
    expect(rejection('darwin', { darwinFileUrl: utf8('https://example.com/a.png') })).toBe(
      'unreadable-file-reference'
    )
    expect(rejection('darwin', { darwinFileNamesPlist: xmlPlist(['relative/a.png']) })).toBe(
      'unreadable-file-reference'
    )
    expect(rejection('darwin', { darwinFileUrl: utf8('file:///Users/me/a%0Arm%20-rf.png') })).toBe(
      'unreadable-file-reference'
    )
  })

  it('rejects inferred relative URLs, encoded separators and Unicode control characters', () => {
    for (const uri of ['file:relative', 'file:///Users/me/a%2Fb', 'file:///Users/me/a%C2%85b']) {
      expect(rejection('darwin', { darwinFileUrl: utf8(uri) })).toBe('unreadable-file-reference')
    }
  })

  it('never names the copied file in the rejection message', () => {
    const error = captureRejection('darwin', {
      darwinFileUrl: utf8('file:///Users/me/secret%0A.pdf')
    })
    expect(error.message).not.toContain('secret')
    expect(error.reason).toBe('unreadable-file-reference')
  })

  it('reads nothing from an empty clipboard or an empty list', () => {
    expect(decodeClipboardFilePaths('darwin', {})).toEqual([])
    expect(decodeClipboardFilePaths('darwin', { darwinFileUrl: Buffer.alloc(0) })).toEqual([])
    expect(decodeClipboardFilePaths('darwin', { darwinFileNamesPlist: xmlPlist([]) })).toEqual([])
  })
})

describe('decodeClipboardFilePaths on Windows', () => {
  it('decodes the single copied file', () => {
    expect(
      decodeClipboardFilePaths('win32', {
        windowsFileNameW: fileNameW('C:\\Users\\me\\spec.pdf'),
        windowsShellIdListArray: shellIdListArray(1)
      })
    ).toEqual(['C:\\Users\\me\\spec.pdf'])
  })

  it('refuses a multi-item copy with a message pointing at dragging', () => {
    const error = captureRejection('win32', {
      windowsFileNameW: fileNameW('C:\\Users\\me\\a.png'),
      windowsShellIdListArray: shellIdListArray(3)
    })
    expect(error.reason).toBe('windows-multiple-items')
    expect(error.message).toMatch(/drag/i)
  })

  it('refuses a bare file name and a pipe UNC path', () => {
    expect(rejection('win32', { windowsFileNameW: fileNameW('spec.pdf') })).toBe(
      'unreadable-file-reference'
    )
    expect(rejection('win32', { windowsFileNameW: fileNameW('\\\\.\\pipe\\x') })).toBe(
      'unreadable-file-reference'
    )
  })

  it('bounds the CIDA buffer even when it declares one copied item', () => {
    const oversized = Buffer.alloc(256 * 1024 + 1)
    oversized.writeUInt32LE(1)
    expect(
      rejection('win32', {
        windowsFileNameW: fileNameW('C:\\Users\\me\\a.png'),
        windowsShellIdListArray: oversized
      })
    ).toBe('file-list-too-large')
  })

  it('reads nothing when no file format is published', () => {
    expect(decodeClipboardFilePaths('win32', {})).toEqual([])
    expect(decodeClipboardFilePaths('win32', { windowsFileNameW: Buffer.alloc(0) })).toEqual([])
  })
})

describe('decodeClipboardFilePaths on Linux', () => {
  it('decodes gnome-copied-files past its copy and cut verbs', () => {
    expect(
      decodeClipboardFilePaths('linux', {
        linuxGnomeCopiedFiles: utf8('copy\nfile:///home/me/a.txt\nfile:///home/me/b%20c.txt')
      })
    ).toEqual(['/home/me/a.txt', '/home/me/b c.txt'])
    expect(
      decodeClipboardFilePaths('linux', {
        linuxGnomeCopiedFiles: utf8('cut\nfile:///home/me/a.txt\n')
      })
    ).toEqual(['/home/me/a.txt'])
  })

  it('refuses a gnome payload whose first line is not a copy verb', () => {
    expect(rejection('linux', { linuxGnomeCopiedFiles: utf8('link\nfile:///home/me/a.txt') })).toBe(
      'unreadable-file-reference'
    )
  })

  it('decodes text/uri-list, skipping comments and blank lines', () => {
    expect(
      decodeClipboardFilePaths('linux', {
        linuxUriList: utf8(
          '# comment\r\n\r\nfile:///home/me/a.txt\r\nfile://localhost/home/me/b.txt\r\n'
        )
      })
    ).toEqual(['/home/me/a.txt', '/home/me/b.txt'])
  })

  it('refuses the whole list when one URI is not a local file', () => {
    expect(
      rejection('linux', {
        linuxUriList: utf8('file:///home/me/a.txt\nhttps://example.com/b.txt')
      })
    ).toBe('unreadable-file-reference')
    expect(rejection('linux', { linuxUriList: utf8('file://nas.local/home/me/a.txt') })).toBe(
      'unreadable-file-reference'
    )
    expect(rejection('linux', { linuxUriList: utf8('file://me:pw@/home/me/a.txt') })).toBe(
      'unreadable-file-reference'
    )
    expect(rejection('linux', { linuxUriList: utf8('file:///home/me/a.txt?x=1') })).toBe(
      'unreadable-file-reference'
    )
    expect(rejection('linux', { linuxUriList: utf8('file:///home/me/a.txt#frag') })).toBe(
      'unreadable-file-reference'
    )
  })

  it('leaves browser link copies to the existing image and text paste paths', () => {
    expect(
      decodeClipboardFilePaths('linux', {
        linuxUriList: utf8('# link\nhttps://example.com/a\nhttps://example.com/b')
      })
    ).toEqual([])
  })

  it('refuses a payload larger than the clipboard list bound', () => {
    const oversized = utf8(`copy\n${'file:///home/me/a.txt\n'.repeat(13_000)}`)

    expect(oversized.byteLength).toBeGreaterThan(256 * 1024)
    expect(rejection('linux', { linuxGnomeCopiedFiles: oversized })).toBe('file-list-too-large')
  })

  it('reads nothing when no file format is published', () => {
    expect(decodeClipboardFilePaths('linux', {})).toEqual([])
    expect(decodeClipboardFilePaths('linux', { linuxUriList: utf8('# comment\n') })).toEqual([])
  })
})

describe('readClipboardFilePaths', () => {
  it('reads only the formats its platform publishes', () => {
    const readBuffer = vi.fn((format: string) =>
      format === 'public.file-url' ? utf8('file:///Users/me/a.png') : Buffer.alloc(0)
    )

    expect(readClipboardFilePaths('darwin', readBuffer)).toEqual(['/Users/me/a.png'])
    expect(readBuffer.mock.calls.map(([format]) => format)).toEqual([
      'public.file-url',
      'NSFilenamesPboardType'
    ])
  })

  it('keeps decoding when one format read throws', () => {
    expect(
      readClipboardFilePaths('linux', (format) => {
        if (format === 'x-special/gnome-copied-files') {
          throw new Error('unavailable format')
        }
        return utf8('file:///home/me/a.txt')
      })
    ).toEqual(['/home/me/a.txt'])
  })

  it('propagates the rejection instead of reporting an empty clipboard', () => {
    expect(() =>
      readClipboardFilePaths('darwin', (format) =>
        format === 'NSFilenamesPboardType' ? utf8('bplist00 truncated') : Buffer.alloc(0)
      )
    ).toThrow(ClipboardFilePathsError)
  })
})
