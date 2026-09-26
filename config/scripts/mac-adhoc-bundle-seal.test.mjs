import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const { assertSealedMacAdhocBundle, shouldSealMacAdhocBundle } = createRequire(import.meta.url)(
  './mac-adhoc-bundle-seal.cjs'
)

const APP_ID = 'br.com.arcatech.arca-desktop'
const SEALED_REPORT = [
  `Identifier=${APP_ID}`,
  'CodeDirectory v=20400 size=1044 flags=0x2(adhoc) hashes=24+7',
  'Signature=adhoc'
].join('\n')

describe('shouldSealMacAdhocBundle', () => {
  it('seals identity-less macOS builds', () => {
    expect(shouldSealMacAdhocBundle({ platformName: 'darwin', isMacRelease: false, env: {} })).toBe(
      true
    )
  })

  it('leaves release builds to the Developer ID signature', () => {
    expect(shouldSealMacAdhocBundle({ platformName: 'darwin', isMacRelease: true, env: {} })).toBe(
      false
    )
  })

  it('never runs off macOS', () => {
    expect(shouldSealMacAdhocBundle({ platformName: 'win32', isMacRelease: false, env: {} })).toBe(
      false
    )
    expect(shouldSealMacAdhocBundle({ platformName: 'linux', isMacRelease: false, env: {} })).toBe(
      false
    )
  })

  it('honors the local opt-out', () => {
    expect(
      shouldSealMacAdhocBundle({
        platformName: 'darwin',
        isMacRelease: false,
        env: { ARCA_MAC_ADHOC_SEAL: '0' }
      })
    ).toBe(false)
  })
})

describe('assertSealedMacAdhocBundle', () => {
  it('accepts a bundle sealed under the app identifier and deep-verifies it', () => {
    const verified = []
    expect(
      assertSealedMacAdhocBundle('/out/ARCA.app', APP_ID, {
        readSignature: () => SEALED_REPORT,
        verifyBundle: (path) => verified.push(path)
      })
    ).toBe(APP_ID)
    expect(verified).toEqual(['/out/ARCA.app'])
  })

  it('fails the build when the seal left Electron as the code identifier', () => {
    expect(() =>
      assertSealedMacAdhocBundle('/out/ARCA.app', APP_ID, {
        readSignature: () =>
          [
            'Identifier=Electron',
            'CodeDirectory v=20400 size=392 flags=0x20002(adhoc,linker-signed) hashes=9+0',
            'Signature=adhoc'
          ].join('\n'),
        verifyBundle: () => {
          throw new Error('verify must not run after an identifier mismatch')
        }
      })
    ).toThrow(/identifier Electron .* expected br\.com\.arcatech\.arca-desktop/)
  })

  it('fails the build when codesign cannot report the signature', () => {
    expect(() =>
      assertSealedMacAdhocBundle('/out/ARCA.app', APP_ID, {
        readSignature: () => {
          throw new Error('codesign -dv failed for /out/ARCA.app: exit 1')
        },
        verifyBundle: () => undefined
      })
    ).toThrow(/codesign -dv failed/)
  })

  it('fails the build when deep verification rejects the sealed bundle', () => {
    expect(() =>
      assertSealedMacAdhocBundle('/out/ARCA.app', APP_ID, {
        readSignature: () => SEALED_REPORT,
        verifyBundle: () => {
          throw new Error('code object is not signed at all')
        }
      })
    ).toThrow(/not signed at all/)
  })
})
