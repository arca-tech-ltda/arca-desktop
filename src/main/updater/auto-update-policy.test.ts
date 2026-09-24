import { describe, expect, it, vi, afterEach } from 'vitest'
import { arcaUpdateFeed, readArcaUpdateFeed, updateArtifactUrl } from './arca-update-feed'
import { areAutoUpdatesEnabled } from './auto-update-policy'
import { readCredential } from '../arca-megamind/credentials'

vi.mock('../arca-megamind/credentials', () => ({
  megamindConfigPath: () => '/config',
  readCredential: vi.fn()
}))
afterEach(() => vi.unstubAllEnvs())

describe('ARCA update policy', () => {
  it('enables only the authenticated stable generic feed', () => {
    expect(areAutoUpdatesEnabled()).toBe(true)
    const feed = arcaUpdateFeed(undefined, 'device-token')
    expect(feed).toEqual({
      provider: 'generic',
      channel: 'latest',
      useMultipleRangeRequest: false,
      url: 'https://mainframe.arcatech.com.br/api/arca/desktop/updates/stable/',
      requestHeaders: { Authorization: 'Bearer device-token' }
    })
    expect(arcaUpdateFeed()).toBeNull()
    expect(arcaUpdateFeed(undefined, ' ')).toBeNull()
    expect(() => arcaUpdateFeed('https://github.com/stablyai/orca', 'token')).toThrow()
    expect(() => arcaUpdateFeed('http://mainframe.arcatech.com.br', 'token')).toThrow()
  })

  it('reads enrollment credentials and refuses mismatched hosts or absent tokens', async () => {
    vi.stubEnv('ARCA_MAINFRAME_URL', 'https://mainframe.arcatech.com.br')
    vi.mocked(readCredential).mockRejectedValueOnce(new Error('missing'))
    expect(await readArcaUpdateFeed()).toBeNull()
    vi.mocked(readCredential).mockResolvedValue({
      endpoint: 'https://mainframe.arcatech.com.br/api',
      token: 'abc',
      tokenFile: '/token'
    })
    expect((await readArcaUpdateFeed())?.requestHeaders.Authorization).toBe('Bearer abc')
    vi.stubEnv('ARCA_MAINFRAME_URL', 'https://other.example')
    expect(await readArcaUpdateFeed()).toBeNull()
  })

  it('rejects external and traversal artifact URLs', () => {
    const feed = arcaUpdateFeed(undefined, 'token')!
    expect(updateArtifactUrl(feed, 'arca-macos-1.5.123-arm64.zip')).toContain(
      '/stable/arca-macos-1.5.123-arm64.zip'
    )
    for (const name of [
      'https://github.com/stablyai/orca',
      '../x.zip',
      'a..zip',
      '/x.zip',
      'x/y.zip'
    ]) {
      expect(() => updateArtifactUrl(feed, name)).toThrow()
    }
  })
})
