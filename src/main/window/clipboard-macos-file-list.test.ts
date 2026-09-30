import { describe, expect, it } from 'vitest'
import { MacClipboardFileListError, decodeMacClipboardFileList } from './clipboard-macos-file-list'
import { NATIVE_FILE_DROP_MAX_PATHS } from '../../shared/native-file-drop'

// 257 real plistlib paths: the root array count needs an extended-length integer.
const OVER_MAX_BASE64 = [
  'YnBsaXN0MDCvEQEBAAEAAgADAAQABQAGAAcACAAJAAoACwAMAA0ADgAPABAAEQASABMAFAAVABYAFwAYABkA',
  'GgAbABwAHQAeAB8AIAAhACIAIwAkACUAJgAnACgAKQAqACsALAAtAC4ALwAwADEAMgAzADQANQA2ADcAOAA5',
  'ADoAOwA8AD0APgA/AEAAQQBCAEMARABFAEYARwBIAEkASgBLAEwATQBOAE8AUABRAFIAUwBUAFUAVgBXAFgA',
  'WQBaAFsAXABdAF4AXwBgAGEAYgBjAGQAZQBmAGcAaABpAGoAawBsAG0AbgBvAHAAcQByAHMAdAB1AHYAdwB4',
  'AHkAegB7AHwAfQB+AH8AgACBAIIAgwCEAIUAhgCHAIgAiQCKAIsAjACNAI4AjwCQAJEAkgCTAJQAlQCWAJcA',
  'mACZAJoAmwCcAJ0AngCfAKAAoQCiAKMApAClAKYApwCoAKkAqgCrAKwArQCuAK8AsACxALIAswC0ALUAtgC3',
  'ALgAuQC6ALsAvAC9AL4AvwDAAMEAwgDDAMQAxQDGAMcAyADJAMoAywDMAM0AzgDPANAA0QDSANMA1ADVANYA',
  '1wDYANkA2gDbANwA3QDeAN8A4ADhAOIA4wDkAOUA5gDnAOgA6QDqAOsA7ADtAO4A7wDwAPEA8gDzAPQA9QD2',
  'APcA+AD5APoA+wD8AP0A/gD/AQABAVcvdG1wL2YwVy90bXAvZjFXL3RtcC9mMlcvdG1wL2YzVy90bXAvZjRX',
  'L3RtcC9mNVcvdG1wL2Y2Vy90bXAvZjdXL3RtcC9mOFcvdG1wL2Y5WC90bXAvZjEwWC90bXAvZjExWC90bXAv',
  'ZjEyWC90bXAvZjEzWC90bXAvZjE0WC90bXAvZjE1WC90bXAvZjE2WC90bXAvZjE3WC90bXAvZjE4WC90bXAv',
  'ZjE5WC90bXAvZjIwWC90bXAvZjIxWC90bXAvZjIyWC90bXAvZjIzWC90bXAvZjI0WC90bXAvZjI1WC90bXAv',
  'ZjI2WC90bXAvZjI3WC90bXAvZjI4WC90bXAvZjI5WC90bXAvZjMwWC90bXAvZjMxWC90bXAvZjMyWC90bXAv',
  'ZjMzWC90bXAvZjM0WC90bXAvZjM1WC90bXAvZjM2WC90bXAvZjM3WC90bXAvZjM4WC90bXAvZjM5WC90bXAv',
  'ZjQwWC90bXAvZjQxWC90bXAvZjQyWC90bXAvZjQzWC90bXAvZjQ0WC90bXAvZjQ1WC90bXAvZjQ2WC90bXAv',
  'ZjQ3WC90bXAvZjQ4WC90bXAvZjQ5WC90bXAvZjUwWC90bXAvZjUxWC90bXAvZjUyWC90bXAvZjUzWC90bXAv',
  'ZjU0WC90bXAvZjU1WC90bXAvZjU2WC90bXAvZjU3WC90bXAvZjU4WC90bXAvZjU5WC90bXAvZjYwWC90bXAv',
  'ZjYxWC90bXAvZjYyWC90bXAvZjYzWC90bXAvZjY0WC90bXAvZjY1WC90bXAvZjY2WC90bXAvZjY3WC90bXAv',
  'ZjY4WC90bXAvZjY5WC90bXAvZjcwWC90bXAvZjcxWC90bXAvZjcyWC90bXAvZjczWC90bXAvZjc0WC90bXAv',
  'Zjc1WC90bXAvZjc2WC90bXAvZjc3WC90bXAvZjc4WC90bXAvZjc5WC90bXAvZjgwWC90bXAvZjgxWC90bXAv',
  'ZjgyWC90bXAvZjgzWC90bXAvZjg0WC90bXAvZjg1WC90bXAvZjg2WC90bXAvZjg3WC90bXAvZjg4WC90bXAv',
  'Zjg5WC90bXAvZjkwWC90bXAvZjkxWC90bXAvZjkyWC90bXAvZjkzWC90bXAvZjk0WC90bXAvZjk1WC90bXAv',
  'Zjk2WC90bXAvZjk3WC90bXAvZjk4WC90bXAvZjk5WS90bXAvZjEwMFkvdG1wL2YxMDFZL3RtcC9mMTAyWS90',
  'bXAvZjEwM1kvdG1wL2YxMDRZL3RtcC9mMTA1WS90bXAvZjEwNlkvdG1wL2YxMDdZL3RtcC9mMTA4WS90bXAv',
  'ZjEwOVkvdG1wL2YxMTBZL3RtcC9mMTExWS90bXAvZjExMlkvdG1wL2YxMTNZL3RtcC9mMTE0WS90bXAvZjEx',
  'NVkvdG1wL2YxMTZZL3RtcC9mMTE3WS90bXAvZjExOFkvdG1wL2YxMTlZL3RtcC9mMTIwWS90bXAvZjEyMVkv',
  'dG1wL2YxMjJZL3RtcC9mMTIzWS90bXAvZjEyNFkvdG1wL2YxMjVZL3RtcC9mMTI2WS90bXAvZjEyN1kvdG1w',
  'L2YxMjhZL3RtcC9mMTI5WS90bXAvZjEzMFkvdG1wL2YxMzFZL3RtcC9mMTMyWS90bXAvZjEzM1kvdG1wL2Yx',
  'MzRZL3RtcC9mMTM1WS90bXAvZjEzNlkvdG1wL2YxMzdZL3RtcC9mMTM4WS90bXAvZjEzOVkvdG1wL2YxNDBZ',
  'L3RtcC9mMTQxWS90bXAvZjE0MlkvdG1wL2YxNDNZL3RtcC9mMTQ0WS90bXAvZjE0NVkvdG1wL2YxNDZZL3Rt',
  'cC9mMTQ3WS90bXAvZjE0OFkvdG1wL2YxNDlZL3RtcC9mMTUwWS90bXAvZjE1MVkvdG1wL2YxNTJZL3RtcC9m',
  'MTUzWS90bXAvZjE1NFkvdG1wL2YxNTVZL3RtcC9mMTU2WS90bXAvZjE1N1kvdG1wL2YxNThZL3RtcC9mMTU5',
  'WS90bXAvZjE2MFkvdG1wL2YxNjFZL3RtcC9mMTYyWS90bXAvZjE2M1kvdG1wL2YxNjRZL3RtcC9mMTY1WS90',
  'bXAvZjE2NlkvdG1wL2YxNjdZL3RtcC9mMTY4WS90bXAvZjE2OVkvdG1wL2YxNzBZL3RtcC9mMTcxWS90bXAv',
  'ZjE3MlkvdG1wL2YxNzNZL3RtcC9mMTc0WS90bXAvZjE3NVkvdG1wL2YxNzZZL3RtcC9mMTc3WS90bXAvZjE3',
  'OFkvdG1wL2YxNzlZL3RtcC9mMTgwWS90bXAvZjE4MVkvdG1wL2YxODJZL3RtcC9mMTgzWS90bXAvZjE4NFkv',
  'dG1wL2YxODVZL3RtcC9mMTg2WS90bXAvZjE4N1kvdG1wL2YxODhZL3RtcC9mMTg5WS90bXAvZjE5MFkvdG1w',
  'L2YxOTFZL3RtcC9mMTkyWS90bXAvZjE5M1kvdG1wL2YxOTRZL3RtcC9mMTk1WS90bXAvZjE5NlkvdG1wL2Yx',
  'OTdZL3RtcC9mMTk4WS90bXAvZjE5OVkvdG1wL2YyMDBZL3RtcC9mMjAxWS90bXAvZjIwMlkvdG1wL2YyMDNZ',
  'L3RtcC9mMjA0WS90bXAvZjIwNVkvdG1wL2YyMDZZL3RtcC9mMjA3WS90bXAvZjIwOFkvdG1wL2YyMDlZL3Rt',
  'cC9mMjEwWS90bXAvZjIxMVkvdG1wL2YyMTJZL3RtcC9mMjEzWS90bXAvZjIxNFkvdG1wL2YyMTVZL3RtcC9m',
  'MjE2WS90bXAvZjIxN1kvdG1wL2YyMThZL3RtcC9mMjE5WS90bXAvZjIyMFkvdG1wL2YyMjFZL3RtcC9mMjIy',
  'WS90bXAvZjIyM1kvdG1wL2YyMjRZL3RtcC9mMjI1WS90bXAvZjIyNlkvdG1wL2YyMjdZL3RtcC9mMjI4WS90',
  'bXAvZjIyOVkvdG1wL2YyMzBZL3RtcC9mMjMxWS90bXAvZjIzMlkvdG1wL2YyMzNZL3RtcC9mMjM0WS90bXAv',
  'ZjIzNVkvdG1wL2YyMzZZL3RtcC9mMjM3WS90bXAvZjIzOFkvdG1wL2YyMzlZL3RtcC9mMjQwWS90bXAvZjI0',
  'MVkvdG1wL2YyNDJZL3RtcC9mMjQzWS90bXAvZjI0NFkvdG1wL2YyNDVZL3RtcC9mMjQ2WS90bXAvZjI0N1kv',
  'dG1wL2YyNDhZL3RtcC9mMjQ5WS90bXAvZjI1MFkvdG1wL2YyNTFZL3RtcC9mMjUyWS90bXAvZjI1M1kvdG1w',
  'L2YyNTRZL3RtcC9mMjU1WS90bXAvZjI1NgAIAg4CFgIeAiYCLgI2Aj4CRgJOAlYCXgJnAnACeQKCAosClAKd',
  'AqYCrwK4AsECygLTAtwC5QLuAvcDAAMJAxIDGwMkAy0DNgM/A0gDUQNaA2MDbAN1A34DhwOQA5kDogOrA7QD',
  'vQPGA88D2APhA+oD8wP8BAUEDgQXBCAEKQQyBDsERARNBFYEXwRoBHEEegSDBIwElQSeBKcEsAS5BMIEywTU',
  'BN0E5gTvBPgFAQUKBRMFHAUlBS4FNwVABUkFUgVbBWQFbQV2BX8FiAWSBZwFpgWwBboFxAXOBdgF4gXsBfYG',
  'AAYKBhQGHgYoBjIGPAZGBlAGWgZkBm4GeAaCBowGlgagBqoGtAa+BsgG0gbcBuYG8Ab6BwQHDgcYByIHLAc2',
  'B0AHSgdUB14HaAdyB3wHhgeQB5oHpAeuB7gHwgfMB9YH4AfqB/QH/ggICBIIHAgmCDAIOghECE4IWAhiCGwI',
  'dgiACIoIlAieCKgIsgi8CMYI0AjaCOQI7gj4CQIJDAkWCSAJKgk0CT4JSAlSCVwJZglwCXoJhAmOCZgJogms',
  'CbYJwAnKCdQJ3gnoCfIJ/AoGChAKGgokCi4KOApCCkwKVgpgCmoKdAp+CogKkgqcCqYKsAq6CsQKzgrYCuIK',
  '7Ar2CwALCgsUCx4LKAsyCzwLRgtQC1oLZAtuC3gLgguMC5YLoAAAAAAAAAICAAAAAAAAAQIAAAAAAAAAAAAA',
  'AAAAAAuq'
].join('')

// Binary fixtures below are real plists: every one except ROOT_NOT_FIRST comes from
// Python `plistlib.dumps(..., fmt=FMT_BINARY)`; ROOT_NOT_FIRST writes the root array
// second (topObject = 1) and is accepted by `plutil -p`.
const BINARY_FIXTURES = {
  ascii:
    'YnBsaXN0MDCjAQIDXxAPL1VzZXJzL21lL2EucG5nXxARL1VzZXJzL21lL2IgYy50eHRfEBMvVm9sdW1lcy9EaXNrL2QucGRmCAweMgAAAAAAAAEBAAAAAAAAAAQAAAAAAAAAAAAAAAAAAABI',
  control:
    'YnBsaXN0MDCiAQJfEA8vVXNlcnMvbWUvYS5wbmdfEBYvVXNlcnMvbWUvYmFkCm5hbWUudHh0CAsdAAAAAAAAAQEAAAAAAAAAAwAAAAAAAAAAAAAAAAAAADY=',
  empty: 'YnBsaXN0MDCgCAAAAAAAAAEBAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAJ',
  extendedCount:
    'YnBsaXN0MDCvEBABAgMEBQYHCAkKCwwNDg8QVy90bXAvZjBXL3RtcC9mMVcvdG1wL2YyVy90bXAvZjNXL3RtcC9mNFcvdG1wL2Y1Vy90bXAvZjZXL3RtcC9mN1cvdG1wL2Y4Vy90bXAvZjlYL3RtcC9mMTBYL3RtcC9mMTFYL3RtcC9mMTJYL3RtcC9mMTNYL3RtcC9mMTRYL3RtcC9mMTUIGyMrMztDS1NbY2t0fYaPmAAAAAAAAAEBAAAAAAAAABEAAAAAAAAAAAAAAAAAAACh',
  nestedArray:
    'YnBsaXN0MDChAaECXxAPL1VzZXJzL21lL2EucG5nCAoMAAAAAAAAAQEAAAAAAAAAAwAAAAAAAAAAAAAAAAAAAB4=',
  overMax: OVER_MAX_BASE64,
  rootDict:
    'YnBsaXN0MDDRAQJVcGF0aHOhA18QDy9Vc2Vycy9tZS9hLnBuZwgLERMAAAAAAAABAQAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAJQ==',
  rootNotFirst:
    'YnBsaXN0MDBfEBMvVXNlcnMvbWUvZmlyc3QucG5nogACXxAUL1VzZXJzL21lL3NlY29uZC5wbmcIHiEAAAAAAAABAQAAAAAAAAADAAAAAAAAAAEAAAAAAAAAOA==',
  unicode:
    'YnBsaXN0MDCiAQJfEA8vVXNlcnMvbWUvYS5wbmdvEBkALwBVAHMAZQByAHMALwBtAGUALwByAGUAbABhAHQA8wByAGkAbwAgJwUALgBwAGQAZggLHQAAAAAAAAEBAAAAAAAAAAMAAAAAAAAAAAAAAAAAAABS'
} as const

function fixture(name: keyof typeof BINARY_FIXTURES): Buffer {
  return Buffer.from(BINARY_FIXTURES[name], 'base64')
}

function xmlPlist(body: string): Buffer {
  return Buffer.from(
    `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n${body}\n</plist>\n`,
    'utf8'
  )
}

function reason(payload: Buffer): string {
  try {
    decodeMacClipboardFileList(payload)
  } catch (error) {
    expect(error).toBeInstanceOf(MacClipboardFileListError)
    if (!(error instanceof MacClipboardFileListError)) {
      throw error
    }
    return error.reason
  }
  throw new Error('expected decodeMacClipboardFileList to reject')
}

function mutate(name: keyof typeof BINARY_FIXTURES, edit: (buffer: Buffer) => void): Buffer {
  const buffer = fixture(name)
  edit(buffer)
  return buffer
}

describe('decodeMacClipboardFileList on binary plists', () => {
  it('decodes a multi-file ASCII list', () => {
    expect(decodeMacClipboardFileList(fixture('ascii'))).toEqual([
      '/Users/me/a.png',
      '/Users/me/b c.txt',
      '/Volumes/Disk/d.pdf'
    ])
  })

  it('decodes UTF-16 paths without mutating the source buffer', () => {
    const payload = fixture('unicode')
    const original = Buffer.from(payload)

    expect(decodeMacClipboardFileList(payload)).toEqual([
      '/Users/me/a.png',
      '/Users/me/relatório ✅.pdf'
    ])
    expect(payload.equals(original)).toBe(true)
  })

  it('decodes a list whose root array is not the first object', () => {
    expect(decodeMacClipboardFileList(fixture('rootNotFirst'))).toEqual([
      '/Users/me/first.png',
      '/Users/me/second.png'
    ])
  })

  it('returns no paths for an empty root array', () => {
    expect(decodeMacClipboardFileList(fixture('empty'))).toEqual([])
  })

  it('returns no paths for an empty payload', () => {
    expect(decodeMacClipboardFileList(Buffer.alloc(0))).toEqual([])
  })

  it('rejects a payload larger than the read budget', () => {
    expect(reason(Buffer.alloc(256 * 1024 + 1))).toBe('payload-too-large')
  })

  it('rejects a control character in a path instead of filtering it out', () => {
    expect(reason(fixture('control'))).toBe('unsupported-path')
  })

  it('decodes a root array whose count uses an extended-length integer', () => {
    expect(decodeMacClipboardFileList(fixture('extendedCount'))).toHaveLength(16)
  })

  it('rejects a root array longer than the native drop cap', () => {
    expect(reason(fixture('overMax'))).toBe('too-many-paths')
  })

  it('rejects a truncated trailer', () => {
    expect(reason(fixture('ascii').subarray(0, 20))).toBe('malformed-binary-plist')
  })

  it('rejects an offset-table offset that points into the trailer', () => {
    expect(
      reason(
        mutate('ascii', (buffer) => {
          buffer.writeUInt32BE(buffer.byteLength - 4, buffer.byteLength - 4)
        })
      )
    ).toBe('malformed-binary-plist')
  })

  it('rejects an object offset that points outside the payload', () => {
    expect(
      reason(
        mutate('ascii', (buffer) => {
          const table = buffer.readUInt32BE(buffer.byteLength - 4)
          buffer[table + 1] = 0xf0
        })
      )
    ).toBe('malformed-binary-plist')
  })

  it('rejects an object count the offset table cannot hold', () => {
    expect(
      reason(
        mutate('ascii', (buffer) => {
          buffer.writeUInt32BE(0xffff, buffer.byteLength - 20)
        })
      )
    ).toBe('malformed-binary-plist')
  })

  it('rejects an out-of-range 64-bit trailer field', () => {
    expect(
      reason(
        mutate('ascii', (buffer) => {
          buffer.writeUInt32BE(0xffffffff, buffer.byteLength - 24)
        })
      )
    ).toBe('malformed-binary-plist')
  })

  it('rejects a top object index past the object count', () => {
    expect(
      reason(
        mutate('ascii', (buffer) => {
          buffer.writeUInt32BE(9, buffer.byteLength - 12)
        })
      )
    ).toBe('malformed-binary-plist')
  })

  it('rejects an unsupported offset width', () => {
    expect(reason(mutate('ascii', (buffer) => void (buffer[buffer.byteLength - 26] = 0)))).toBe(
      'malformed-binary-plist'
    )
  })

  it('rejects a root object that is not an array', () => {
    expect(reason(fixture('rootDict'))).toBe('malformed-binary-plist')
  })

  it('rejects a nested array instead of walking the object graph', () => {
    expect(reason(fixture('nestedArray'))).toBe('malformed-binary-plist')
  })

  it('rejects a header it does not recognise', () => {
    expect(reason(Buffer.from('bplist01 whatever payload bytes here', 'latin1'))).toBe(
      'unsupported-format'
    )
  })
})

describe('decodeMacClipboardFileList on XML plists', () => {
  it('decodes named and numeric entities', () => {
    expect(
      decodeMacClipboardFileList(
        xmlPlist(
          '<array><string>/Users/me/b &amp; c.png</string><string>/Users/me/&#47;&#x61;.txt</string><string>/Users/me/&lt;x&gt;&apos;&quot;.md</string></array>'
        )
      )
    ).toEqual(['/Users/me/b & c.png', '/Users/me//a.txt', '/Users/me/<x>\'".md'])
  })

  it('decodes an empty array both spellings', () => {
    expect(decodeMacClipboardFileList(xmlPlist('<array/>'))).toEqual([])
    expect(decodeMacClipboardFileList(xmlPlist('<array>\n  </array>'))).toEqual([])
  })

  it('rejects an entity it would have to resolve from a DTD', () => {
    expect(reason(xmlPlist('<array><string>&xxe;</string></array>'))).toBe('malformed-xml-plist')
  })

  it('rejects a doctype with an internal subset', () => {
    expect(
      reason(
        Buffer.from(
          '<?xml version="1.0"?><!DOCTYPE plist [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><plist version="1.0"><array><string>/a</string></array></plist>',
          'utf8'
        )
      )
    ).toBe('malformed-xml-plist')
  })

  it('rejects a numeric entity that encodes a control character', () => {
    expect(reason(xmlPlist('<array><string>/Users/me/a&#10;b</string></array>'))).toBe(
      'unsupported-path'
    )
  })

  it('rejects a numeric entity outside Unicode', () => {
    expect(reason(xmlPlist('<array><string>/a&#x110000;</string></array>'))).toBe(
      'malformed-xml-plist'
    )
  })

  it('rejects a relative path rather than returning a partial list', () => {
    expect(
      reason(xmlPlist('<array><string>/Users/me/a.png</string><string>b.png</string></array>'))
    ).toBe('unsupported-path')
  })

  it('rejects a non-string array member', () => {
    expect(reason(xmlPlist('<array><string>/a</string><integer>2</integer></array>'))).toBe(
      'malformed-xml-plist'
    )
  })

  it('rejects a nested array', () => {
    expect(reason(xmlPlist('<array><array><string>/a</string></array></array>'))).toBe(
      'malformed-xml-plist'
    )
  })

  it('rejects a root dict', () => {
    expect(reason(xmlPlist('<dict><key>a</key><string>/a</string></dict>'))).toBe(
      'malformed-xml-plist'
    )
  })

  it('rejects an unterminated string element', () => {
    expect(reason(xmlPlist('<array><string>/Users/me/a.png</array>'))).toBe('malformed-xml-plist')
  })

  it('rejects trailing content after the plist', () => {
    expect(reason(Buffer.from('<plist version="1.0"><array/></plist><plist/>', 'utf8'))).toBe(
      'malformed-xml-plist'
    )
  })

  it('rejects more strings than the native drop cap', () => {
    const entries = Array.from(
      { length: NATIVE_FILE_DROP_MAX_PATHS + 1 },
      (_value, index) => `<string>/tmp/f${index}</string>`
    ).join('')
    expect(reason(xmlPlist(`<array>${entries}</array>`))).toBe('too-many-paths')
  })

  it('accepts exactly the native drop cap', () => {
    const entries = Array.from(
      { length: NATIVE_FILE_DROP_MAX_PATHS },
      (_value, index) => `<string>/tmp/f${index}</string>`
    ).join('')
    expect(decodeMacClipboardFileList(xmlPlist(`<array>${entries}</array>`))).toHaveLength(
      NATIVE_FILE_DROP_MAX_PATHS
    )
  })

  it('never reads a bare path or file URL as XML', () => {
    expect(reason(Buffer.from('/Users/me/a.png', 'utf8'))).toBe('unsupported-format')
    expect(reason(Buffer.from('file:///Users/me/a.png', 'utf8'))).toBe('unsupported-format')
    expect(reason(Buffer.from('<html><body>/a</body></html>', 'utf8'))).toBe('unsupported-format')
  })

  it('rejects a path longer than the per-path limit', () => {
    const long = `/Users/me/${'a'.repeat(4100)}`
    expect(reason(xmlPlist(`<array><string>${long}</string></array>`))).toBe('unsupported-path')
  })

  it('does not leak payload bytes in the error message', () => {
    let message = ''
    try {
      decodeMacClipboardFileList(
        xmlPlist('<array><string>/Users/me/secret-token.txt</string><string>bad</string></array>')
      )
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }
    expect(message).toBe('NSFilenamesPboardType could not be decoded (unsupported-path)')
  })
})
