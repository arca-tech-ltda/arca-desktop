import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const { isAdhocMacSignature, shouldSealMacAdhocBundle } = createRequire(import.meta.url)(
  './mac-adhoc-bundle-seal.cjs'
)

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

describe('isAdhocMacSignature', () => {
  it('recognizes the signature Electron ships', () => {
    expect(
      isAdhocMacSignature(
        [
          'Identifier=Electron',
          'CodeDirectory v=20400 size=392 flags=0x20002(adhoc,linker-signed) hashes=9+0',
          'Signature=adhoc'
        ].join('\n')
      )
    ).toBe(true)
  })

  it('leaves a Developer ID signature untouched', () => {
    expect(
      isAdhocMacSignature(
        [
          'Identifier=br.com.arcatech.arca-desktop',
          'Signature size=9068',
          'Authority=Developer ID Application: ARCA (TEAMID)'
        ].join('\n')
      )
    ).toBe(false)
  })
})
