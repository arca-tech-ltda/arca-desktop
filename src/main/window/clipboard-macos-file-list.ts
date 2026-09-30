import {
  NATIVE_FILE_DROP_MAX_PATHS,
  validateNativeFileDropPaths
} from '../../shared/native-file-drop'
import { decodeXmlPlistFileList, readXmlPlistText } from './clipboard-macos-file-list-xml'

const MAX_PAYLOAD_BYTES = 256 * 1024
const MAX_PATH_LENGTH = 4096
const BPLIST_HEADER = 'bplist00'
const HEADER_BYTES = 8
const TRAILER_BYTES = 32

export type MacClipboardFileListRejection =
  | 'malformed-binary-plist'
  | 'malformed-xml-plist'
  | 'payload-too-large'
  | 'paths-too-large'
  | 'too-many-paths'
  | 'unsupported-format'
  | 'unsupported-path'

/** Never carries payload bytes: the clipboard can hold another app's private data. */
export class MacClipboardFileListError extends Error {
  readonly reason: MacClipboardFileListRejection

  constructor(reason: MacClipboardFileListRejection) {
    super(`NSFilenamesPboardType could not be decoded (${reason})`)
    this.name = 'MacClipboardFileListError'
    this.reason = reason
  }
}

function reject(reason: MacClipboardFileListRejection): never {
  throw new MacClipboardFileListError(reason)
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code < 0x20 || code === 0x7f) {
      return true
    }
  }
  return false
}

function assertFileListPaths(paths: readonly string[]): string[] {
  for (const path of paths) {
    if (
      path.length === 0 ||
      path.length > MAX_PATH_LENGTH ||
      !path.startsWith('/') ||
      hasControlCharacter(path)
    ) {
      reject('unsupported-path')
    }
  }
  const validation = validateNativeFileDropPaths(paths)
  if (validation.status === 'rejected') {
    reject(validation.reason)
  }
  return [...paths]
}

/** Big-endian unsigned read that refuses any value it could not represent exactly. */
function readUnsignedBigEndian(buffer: Buffer, offset: number, width: number): number {
  if (width < 1 || width > 8 || offset < 0 || offset + width > buffer.byteLength) {
    reject('malformed-binary-plist')
  }
  let value = 0
  for (let index = 0; index < width; index += 1) {
    const byte = buffer[offset + index]
    if (value > (Number.MAX_SAFE_INTEGER - byte) / 256) {
      reject('malformed-binary-plist')
    }
    value = value * 256 + byte
  }
  return value
}

type BinaryPlistFrame = {
  buffer: Buffer
  objectCount: number
  offsets: readonly number[]
  payloadEnd: number
  refWidth: number
  topObject: number
}

function readBinaryPlistFrame(buffer: Buffer): BinaryPlistFrame {
  const trailer = buffer.byteLength - TRAILER_BYTES
  if (trailer < HEADER_BYTES) {
    reject('malformed-binary-plist')
  }
  const offsetWidth = buffer[trailer + 6]
  const refWidth = buffer[trailer + 7]
  const objectCount = readUnsignedBigEndian(buffer, trailer + 8, 8)
  const topObject = readUnsignedBigEndian(buffer, trailer + 16, 8)
  const payloadEnd = readUnsignedBigEndian(buffer, trailer + 24, 8)
  if (
    offsetWidth < 1 ||
    offsetWidth > 8 ||
    refWidth < 1 ||
    refWidth > 8 ||
    payloadEnd < HEADER_BYTES ||
    payloadEnd > trailer ||
    objectCount < 1 ||
    objectCount > (trailer - payloadEnd) / offsetWidth ||
    topObject >= objectCount
  ) {
    reject('malformed-binary-plist')
  }
  const offsets: number[] = []
  for (let index = 0; index < objectCount; index += 1) {
    const offset = readUnsignedBigEndian(buffer, payloadEnd + index * offsetWidth, offsetWidth)
    // An object living in the offset table or the trailer is not an object.
    if (offset < HEADER_BYTES || offset >= payloadEnd) {
      reject('malformed-binary-plist')
    }
    offsets.push(offset)
  }
  return { buffer, objectCount, offsets, payloadEnd, refWidth, topObject }
}

type MarkedLength = { dataOffset: number; length: number }

function readMarkedLength(frame: BinaryPlistFrame, offset: number): MarkedLength {
  const low = frame.buffer[offset] & 0x0f
  if (low !== 0x0f) {
    return { dataOffset: offset + 1, length: low }
  }
  const sizeMarker = frame.buffer[offset + 1]
  if (offset + 1 >= frame.payloadEnd || (sizeMarker & 0xf0) !== 0x10) {
    reject('malformed-binary-plist')
  }
  const exponent = sizeMarker & 0x0f
  if (exponent > 3) {
    reject('malformed-binary-plist')
  }
  const width = 1 << exponent
  return {
    dataOffset: offset + 2 + width,
    length: readUnsignedBigEndian(frame.buffer, offset + 2, width)
  }
}

function decodeUtf16BigEndian(buffer: Buffer, offset: number, unitCount: number): string {
  const units: number[] = []
  for (let index = 0; index < unitCount; index += 1) {
    units.push(buffer.readUInt16BE(offset + index * 2))
  }
  return String.fromCharCode(...units)
}

function decodeBinaryPlistString(frame: BinaryPlistFrame, offset: number): string {
  const kind = frame.buffer[offset] & 0xf0
  // Only the two string spellings are readable here: no nested containers, no object graph.
  if (kind !== 0x50 && kind !== 0x60) {
    reject('malformed-binary-plist')
  }
  const { dataOffset, length } = readMarkedLength(frame, offset)
  if (length > MAX_PATH_LENGTH) {
    reject('unsupported-path')
  }
  const byteLength = kind === 0x50 ? length : length * 2
  if (dataOffset + byteLength > frame.payloadEnd) {
    reject('malformed-binary-plist')
  }
  if (kind === 0x60) {
    return decodeUtf16BigEndian(frame.buffer, dataOffset, length)
  }
  for (let index = 0; index < length; index += 1) {
    if (frame.buffer[dataOffset + index] > 0x7f) {
      reject('malformed-binary-plist')
    }
  }
  return frame.buffer.toString('latin1', dataOffset, dataOffset + length)
}

function decodeBinaryFileList(payload: Buffer): string[] {
  const frame = readBinaryPlistFrame(payload)
  const rootOffset = frame.offsets[frame.topObject]
  if ((payload[rootOffset] & 0xf0) !== 0xa0) {
    reject('malformed-binary-plist')
  }
  const { dataOffset, length } = readMarkedLength(frame, rootOffset)
  if (length > NATIVE_FILE_DROP_MAX_PATHS) {
    reject('too-many-paths')
  }
  if (dataOffset + length * frame.refWidth > frame.payloadEnd) {
    reject('malformed-binary-plist')
  }
  const paths: string[] = []
  for (let index = 0; index < length; index += 1) {
    const ref = readUnsignedBigEndian(payload, dataOffset + index * frame.refWidth, frame.refWidth)
    if (ref >= frame.objectCount) {
      reject('malformed-binary-plist')
    }
    paths.push(decodeBinaryPlistString(frame, frame.offsets[ref]))
  }
  return paths
}

/**
 * Absolute local paths from a macOS `NSFilenamesPboardType` payload, in either
 * plist spelling. Throws `MacClipboardFileListError` on anything it cannot read
 * in full — never a partial list. `payload` is not modified.
 */
export function decodeMacClipboardFileList(payload: Buffer): string[] {
  if (payload.byteLength === 0) {
    return []
  }
  if (payload.byteLength > MAX_PAYLOAD_BYTES) {
    reject('payload-too-large')
  }
  if (
    payload.byteLength >= HEADER_BYTES &&
    payload.toString('latin1', 0, HEADER_BYTES) === BPLIST_HEADER
  ) {
    return assertFileListPaths(decodeBinaryFileList(payload))
  }
  const xml = readXmlPlistText(payload)
  if (xml === null) {
    reject('unsupported-format')
  }
  return assertFileListPaths(decodeXmlPlistFileList(xml, reject))
}
