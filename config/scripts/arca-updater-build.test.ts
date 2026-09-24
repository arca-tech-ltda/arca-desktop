import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseDocument } from 'yaml'
import { afterEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
afterEach(() => vi.unstubAllEnvs())

describe('ARCA update publication', () => {
  it('validates workflow YAML and monotonic run-number version wiring', () => {
    const text = readFileSync(resolve('.github/workflows/arca-desktop-build.yml'), 'utf8')
    const document = parseDocument(text, { uniqueKeys: true })
    expect(document.errors).toEqual([])
    expect(document.getIn(['env', 'ARCA_RELEASE_VERSION'])).toBe('1.5.${{ github.run_number }}')
    expect(document.getIn(['jobs', 'publish', 'if'])).toBe(
      "github.event_name == 'push' && github.ref == 'refs/heads/arca-desktop'"
    )
    expect(text).toContain("if: env.ARCA_DESKTOP_PUBLISH_TOKEN != ''")
    expect(text).toContain('curl --fail --retry 5 --retry-all-errors')
    expect(text.indexOf('for file in release/*.exe')).toBeLessThan(
      text.indexOf('for file in release/latest*.yml')
    )
    expect(text.match(/--publish never/g)).toHaveLength(2)
    expect(text).toContain('dist/latest.yml')
    expect(text).toContain('dist/latest-mac.yml')
  })

  it('stamps the version, disables NSIS signature checks and emits a generic feed', () => {
    vi.stubEnv('ARCA_RELEASE_VERSION', '1.5.123')
    const path = resolve('config/electron-builder.config.cjs')
    delete require.cache[path]
    const config = require(path)
    expect(config.extraMetadata.version).toBe('1.5.123')
    expect(config.win.verifyUpdateCodeSignature).toBe(false)
    expect(config.publish).toEqual({
      provider: 'generic',
      channel: 'latest',
      url: 'https://mainframe.arcatech.com.br/api/arca/desktop/updates/stable/'
    })
    expect(config.nsis.artifactName).toContain('${version}')
    expect(config.mac.artifactName).toBe('arca-macos-${version}-${arch}.${ext}')
  })
})
