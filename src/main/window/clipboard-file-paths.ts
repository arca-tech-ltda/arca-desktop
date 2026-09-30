import { fileURLToPath } from 'node:url'
import { validateNativeFileDropPaths } from '../../shared/native-file-drop'
import {
  decodeMacClipboardFileList,
  MacClipboardFileListError,
  type MacClipboardFileListRejection
} from './clipboard-macos-file-list'
import {
  decodeWindowsClipboardFileNameW,
  hasAtMostOneWindowsClipboardShellItem,
  isFullyQualifiedWindowsPath
} from './clipboard-windows-file-reference'

/** Raw OS clipboard buffers a file reference can be carried in, per platform. */
export type ClipboardFilePathFormats = {
  /** macOS `public.file-url`: the first (or only) copied file, as a file URL. */
  darwinFileUrl?: Buffer
  /** macOS `NSFilenamesPboardType`: a plist of every copied path. */
  darwinFileNamesPlist?: Buffer
  /** Windows `FileNameW`: the first copied path, UTF-16LE and NUL-terminated. */
  windowsFileNameW?: Buffer
  /** Windows `Shell IDList Array`: how many items the copy actually holds. */
  windowsShellIdListArray?: Buffer
  /** Linux `text/uri-list`. */
  linuxUriList?: Buffer
  /** Linux `x-special/gnome-copied-files`: a verb line followed by file URIs. */
  linuxGnomeCopiedFiles?: Buffer
}

const CLIPBOARD_FILE_PATH_MAX_LENGTH = 4096
const CLIPBOARD_FILE_LIST_MAX_BYTES = 256 * 1024
const GNOME_COPIED_FILES_VERBS = new Set(['copy', 'cut'])

export type ClipboardFilePathsRejection =
  | 'file-list-too-large'
  | 'too-many-files'
  | 'unreadable-file-reference'
  | 'windows-multiple-items'

const REJECTION_MESSAGES: Record<ClipboardFilePathsRejection, string> = {
  'file-list-too-large': 'The copied file list is too large to paste.',
  'too-many-files': 'Too many files were copied to paste them at once.',
  'unreadable-file-reference': 'The copied file reference could not be read.',
  'windows-multiple-items':
    'Pasting several files at once is not supported on Windows. Drag them into the terminal instead.'
}

/** Never carries a decoded path: the message is shown to the user and the clipboard is another app's data. */
export class ClipboardFilePathsError extends Error {
  readonly reason: ClipboardFilePathsRejection

  constructor(reason: ClipboardFilePathsRejection) {
    super(REJECTION_MESSAGES[reason])
    this.name = 'ClipboardFilePathsError'
    this.reason = reason
  }
}

function reject(reason: ClipboardFilePathsRejection): never {
  throw new ClipboardFilePathsError(reason)
}

function mapMacRejection(reason: MacClipboardFileListRejection): ClipboardFilePathsRejection {
  if (reason === 'too-many-paths') {
    return 'too-many-files'
  }
  return reason === 'paths-too-large' || reason === 'payload-too-large'
    ? 'file-list-too-large'
    : 'unreadable-file-reference'
}

function decodeBoundedText(value: Buffer | undefined): string | null {
  if (!value || value.byteLength === 0) {
    return null
  }
  if (value.byteLength > CLIPBOARD_FILE_LIST_MAX_BYTES) {
    reject('file-list-too-large')
  }
  return value.toString('utf8')
}

function hasControlCharacter(value: string): boolean {
  return /\p{Cc}/u.test(value)
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

// Explicit POSIX decoding keeps host-independent tests and rejects encoded separators.
function fileUriToPosixPath(value: string): string {
  const normalized = value.trim()
  const url = parseUrl(normalized)
  if (
    !/^file:\/\//i.test(normalized) ||
    !url ||
    url.protocol !== 'file:' ||
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== '' ||
    // A non-local host names a file this machine cannot open.
    (url.hostname !== '' && url.hostname.toLowerCase() !== 'localhost')
  ) {
    reject('unreadable-file-reference')
  }
  try {
    return fileURLToPath(url, { windows: false })
  } catch {
    reject('unreadable-file-reference')
  }
}

// Control characters would let a decoded path smuggle terminal escapes or line
// breaks past the drop writer's shell quoting.
function assertSafeClipboardPaths(
  paths: readonly string[],
  platform: 'darwin' | 'linux' | 'win32'
): string[] {
  for (const path of paths) {
    const absolute = platform === 'win32' ? isFullyQualifiedWindowsPath(path) : path.startsWith('/')
    if (
      !absolute ||
      path.length === 0 ||
      path.length > CLIPBOARD_FILE_PATH_MAX_LENGTH ||
      hasControlCharacter(path)
    ) {
      reject('unreadable-file-reference')
    }
  }
  const validation = validateNativeFileDropPaths(paths)
  if (validation.status === 'rejected') {
    reject(validation.reason === 'too-many-paths' ? 'too-many-files' : 'file-list-too-large')
  }
  return [...paths]
}

function decodeDarwinClipboardFilePaths(formats: ClipboardFilePathFormats): string[] {
  const plist = formats.darwinFileNamesPlist
  // Why: the plist is the whole copy, so falling back to the single `public.file-url`
  // when it cannot be read would paste one file out of a multi-file selection.
  if (plist && plist.byteLength > 0) {
    try {
      return decodeMacClipboardFileList(plist)
    } catch (error) {
      if (error instanceof MacClipboardFileListError) {
        reject(mapMacRejection(error.reason))
      }
      throw error
    }
  }
  const fileUrl = decodeBoundedText(formats.darwinFileUrl)
  return fileUrl === null ? [] : [fileUriToPosixPath(fileUrl)]
}

function decodeWindowsClipboardFilePaths(formats: ClipboardFilePathFormats): string[] {
  // Why: with several items copied, FileNameW names only the first and no
  // Electron-readable format carries the rest, so the copy has to be refused.
  if (!hasAtMostOneWindowsClipboardShellItem(formats.windowsShellIdListArray ?? Buffer.alloc(0))) {
    reject('windows-multiple-items')
  }
  const fileNameW = formats.windowsFileNameW
  if (!fileNameW || fileNameW.byteLength === 0) {
    return []
  }
  const path = decodeWindowsClipboardFileNameW(fileNameW)
  if (path === null) {
    reject('unreadable-file-reference')
  }
  return [path]
}

function collectFileUriLines(lines: readonly string[]): string[] {
  const paths: string[] = []
  for (const line of lines) {
    const value = line.trim()
    if (value === '' || value.startsWith('#')) {
      continue
    }
    paths.push(fileUriToPosixPath(value))
  }
  return paths
}

function decodeLinuxClipboardFilePaths(formats: ClipboardFilePathFormats): string[] {
  const gnome = decodeBoundedText(formats.linuxGnomeCopiedFiles)
  if (gnome !== null) {
    const lines = gnome.split(/\r?\n/)
    // GNOME's payload opens with the `copy`/`cut` verb; anything else is not this format.
    if (!GNOME_COPIED_FILES_VERBS.has(lines[0].trim())) {
      reject('unreadable-file-reference')
    }
    return collectFileUriLines(lines.slice(1))
  }
  const uriList = decodeBoundedText(formats.linuxUriList)
  if (uriList === null) {
    return []
  }
  const lines = uriList.split(/\r?\n/)
  // Browsers also publish link copies as URI lists; those are text, not copied files.
  if (!lines.some((line) => /^file:/i.test(line.trim()))) {
    return []
  }
  return collectFileUriLines(lines)
}

function resolveClipboardFilePathPlatform(platform: NodeJS.Platform): 'darwin' | 'linux' | 'win32' {
  if (platform === 'darwin' || platform === 'win32') {
    return platform
  }
  return 'linux'
}

/**
 * Local absolute paths for the files currently referenced on the OS clipboard.
 * Empty only when the clipboard publishes no file format or an explicitly empty
 * list; anything referenced but undecodable throws `ClipboardFilePathsError`
 * rather than degrading to a partial list or to the icon-image paste path.
 */
export function decodeClipboardFilePaths(
  platform: NodeJS.Platform,
  formats: ClipboardFilePathFormats
): string[] {
  const decoders = {
    darwin: decodeDarwinClipboardFilePaths,
    linux: decodeLinuxClipboardFilePaths,
    win32: decodeWindowsClipboardFilePaths
  }
  const resolved = resolveClipboardFilePathPlatform(platform)
  for (const [key] of CLIPBOARD_FILE_PATH_FORMAT_NAMES[resolved]) {
    const payload = formats[key]
    if (payload && payload.byteLength > CLIPBOARD_FILE_LIST_MAX_BYTES) {
      reject('file-list-too-large')
    }
  }
  return assertSafeClipboardPaths(decoders[resolved](formats), resolved)
}

/** Clipboard formats worth reading on `platform`, in `clipboard.readBuffer` terms. */
export const CLIPBOARD_FILE_PATH_FORMAT_NAMES: Record<
  'darwin' | 'linux' | 'win32',
  readonly [keyof ClipboardFilePathFormats, string][]
> = {
  darwin: [
    ['darwinFileUrl', 'public.file-url'],
    ['darwinFileNamesPlist', 'NSFilenamesPboardType']
  ],
  linux: [
    ['linuxGnomeCopiedFiles', 'x-special/gnome-copied-files'],
    ['linuxUriList', 'text/uri-list']
  ],
  win32: [
    ['windowsFileNameW', 'FileNameW'],
    ['windowsShellIdListArray', 'Shell IDList Array']
  ]
}

export function readClipboardFilePaths(
  platform: NodeJS.Platform,
  readBuffer: (format: string) => Buffer
): string[] {
  const names = CLIPBOARD_FILE_PATH_FORMAT_NAMES[resolveClipboardFilePathPlatform(platform)]
  const formats: ClipboardFilePathFormats = {}
  for (const [key, format] of names) {
    try {
      formats[key] = readBuffer(format)
    } catch {
      // An absent format throws on some platforms; the others still decode.
    }
  }
  return decodeClipboardFilePaths(platform, formats)
}
