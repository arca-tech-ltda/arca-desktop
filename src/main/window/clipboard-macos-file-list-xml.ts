import { NATIVE_FILE_DROP_MAX_PATHS } from '../../shared/native-file-drop'

const STRING_CLOSE_TAG = '</string>'

/** The subset of the decoder's rejection reasons the XML spelling can produce. */
export type XmlPlistRejection = 'malformed-xml-plist' | 'too-many-paths' | 'unsupported-path'

/** Supplied by the decoder so both plist spellings raise one error type. */
export type RejectXmlPlist = (reason: XmlPlistRejection) => never

const XML_NAMED_ENTITIES = new Map([
  ['amp', '&'],
  ['apos', "'"],
  ['gt', '>'],
  ['lt', '<'],
  ['quot', '"']
])
const XML_NUMERIC_ENTITY = /^#(?:x([0-9a-fA-F]{1,6})|([0-9]{1,7}))$/

function resolveXmlEntity(token: string, reject: RejectXmlPlist): string {
  const named = XML_NAMED_ENTITIES.get(token)
  if (named !== undefined) {
    return named
  }
  const numeric = XML_NUMERIC_ENTITY.exec(token)
  if (!numeric) {
    // Anything else would be a DTD-declared entity, which this reader never resolves.
    reject('malformed-xml-plist')
  }
  const code = numeric[1] ? Number.parseInt(numeric[1], 16) : Number.parseInt(numeric[2], 10)
  if (code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
    reject('malformed-xml-plist')
  }
  return String.fromCodePoint(code)
}

function decodeXmlEntities(raw: string, reject: RejectXmlPlist): string {
  let result = ''
  let index = 0
  while (index < raw.length) {
    const start = raw.indexOf('&', index)
    if (start === -1) {
      return result + raw.slice(index)
    }
    const end = raw.indexOf(';', start + 1)
    if (end === -1) {
      reject('malformed-xml-plist')
    }
    result += raw.slice(index, start) + resolveXmlEntity(raw.slice(start + 1, end), reject)
    index = end + 1
  }
  return result
}

type XmlCursor = { index: number; readonly reject: RejectXmlPlist; readonly text: string }

function skipXmlSpace(cursor: XmlCursor): void {
  while (cursor.index < cursor.text.length && /\s/.test(cursor.text[cursor.index])) {
    cursor.index += 1
  }
}

function tryConsume(cursor: XmlCursor, token: string): boolean {
  if (!cursor.text.startsWith(token, cursor.index)) {
    return false
  }
  cursor.index += token.length
  return true
}

function expectConsume(cursor: XmlCursor, token: string): void {
  if (!tryConsume(cursor, token)) {
    cursor.reject('malformed-xml-plist')
  }
}

/** Consumes the rest of an already-named start tag; true when it is self-closing. */
function consumeTagRemainder(cursor: XmlCursor): boolean {
  const end = cursor.text.indexOf('>', cursor.index)
  if (end === -1) {
    cursor.reject('malformed-xml-plist')
  }
  const remainder = cursor.text.slice(cursor.index, end)
  if (remainder.includes('<') || (remainder.length > 0 && !/^[\s/]/.test(remainder))) {
    cursor.reject('malformed-xml-plist')
  }
  cursor.index = end + 1
  return remainder.endsWith('/')
}

function skipXmlPrologue(cursor: XmlCursor): void {
  if (tryConsume(cursor, '<?xml')) {
    const end = cursor.text.indexOf('?>', cursor.index)
    if (end === -1) {
      cursor.reject('malformed-xml-plist')
    }
    cursor.index = end + 2
    skipXmlSpace(cursor)
  }
  if (tryConsume(cursor, '<!DOCTYPE')) {
    const end = cursor.text.indexOf('>', cursor.index)
    // An internal subset is where a DTD would declare entities.
    if (end === -1 || cursor.text.slice(cursor.index, end).includes('[')) {
      cursor.reject('malformed-xml-plist')
    }
    cursor.index = end + 1
    skipXmlSpace(cursor)
  }
}

function readXmlStringEntries(cursor: XmlCursor): string[] {
  const paths: string[] = []
  skipXmlSpace(cursor)
  while (!tryConsume(cursor, '</array>')) {
    expectConsume(cursor, '<string')
    if (consumeTagRemainder(cursor)) {
      cursor.reject('unsupported-path')
    }
    const end = cursor.text.indexOf(STRING_CLOSE_TAG, cursor.index)
    if (end === -1) {
      cursor.reject('malformed-xml-plist')
    }
    const raw = cursor.text.slice(cursor.index, end)
    if (raw.includes('<')) {
      cursor.reject('malformed-xml-plist')
    }
    if (paths.length >= NATIVE_FILE_DROP_MAX_PATHS) {
      cursor.reject('too-many-paths')
    }
    paths.push(decodeXmlEntities(raw, cursor.reject))
    cursor.index = end + STRING_CLOSE_TAG.length
    skipXmlSpace(cursor)
  }
  return paths
}

/** Every path of an XML `<plist><array>` of `<string>`s, or nothing at all. */
export function decodeXmlPlistFileList(text: string, reject: RejectXmlPlist): string[] {
  const cursor: XmlCursor = { index: 0, reject, text }
  skipXmlPrologue(cursor)
  expectConsume(cursor, '<plist')
  if (consumeTagRemainder(cursor)) {
    reject('malformed-xml-plist')
  }
  skipXmlSpace(cursor)
  expectConsume(cursor, '<array')
  const paths = consumeTagRemainder(cursor) ? [] : readXmlStringEntries(cursor)
  skipXmlSpace(cursor)
  expectConsume(cursor, '</plist>')
  skipXmlSpace(cursor)
  if (cursor.index !== text.length) {
    reject('malformed-xml-plist')
  }
  return paths
}

const XML_PLIST_OPENING = /^(?:<\?xml[\s?]|<!DOCTYPE\s+plist|<plist[\s>])/

/** The trimmed payload when it opens like an XML plist, else `null`. */
export function readXmlPlistText(payload: Buffer): string | null {
  const text = payload
    .toString('utf8')
    .replace(/^\uFEFF/, '')
    .trim()
  return XML_PLIST_OPENING.test(text) ? text : null
}
