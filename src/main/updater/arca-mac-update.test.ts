import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  appQuit: vi.fn(),
  extract: vi.fn(),
  launch: vi.fn(),
  mkdtemp: vi.fn(),
  netFetch: vi.fn(),
  pipeline: vi.fn(),
  verify: vi.fn(),
  writableTarget: vi.fn(),
  writeStream: vi.fn()
}))

vi.mock('electron', () => ({
  app: { getVersion: () => '1.5.1', quit: mocks.appQuit },
  net: { fetch: mocks.netFetch }
}))
vi.mock('node:fs', () => ({ createWriteStream: mocks.writeStream }))
vi.mock('node:fs/promises', () => ({
  mkdtemp: mocks.mkdtemp,
  rm: vi.fn().mockResolvedValue(undefined)
}))
vi.mock('node:stream/promises', () => ({ pipeline: mocks.pipeline }))
vi.mock('./arca-update-feed', () => ({
  MEGAMIND_UPDATE_REQUIRED: 'arca-updater:megamind-required',
  readArcaUpdateFeed: vi.fn().mockResolvedValue({
    provider: 'generic',
    url: 'https://mainframe.arcatech.com.br/api/arca/desktop/updates/stable/',
    channel: 'latest',
    useMultipleRangeRequest: false,
    requestHeaders: { Authorization: 'Bearer device' }
  }),
  updateArtifactUrl: (_feed: unknown, filename: string) =>
    `https://mainframe.arcatech.com.br/api/arca/desktop/updates/stable/${filename}`
}))
vi.mock('./arca-mac-install', () => ({
  extractMacUpdate: mocks.extract,
  launchMacInstaller: mocks.launch,
  verifyUpdateSha512: mocks.verify,
  writableMacTarget: mocks.writableTarget
}))

import { ArcaMacUpdate } from './arca-mac-update'

describe('ARCA macOS update flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mkdtemp.mockResolvedValue('/tmp/arca-update-test')
    mocks.pipeline.mockResolvedValue(undefined)
    mocks.verify.mockResolvedValue(undefined)
    mocks.extract.mockResolvedValue('/tmp/arca-update-test/extracted/ARCA.app')
    mocks.writableTarget.mockResolvedValue('/Applications/ARCA.app')
    mocks.launch.mockResolvedValue(undefined)
    mocks.writeStream.mockReturnValue({})
  })

  it('downloads the matching authenticated ZIP and stages it after SHA512 verification', async () => {
    const manifest = [
      'version: 1.5.2',
      'files:',
      `  - url: arca-macos-1.5.2-${process.arch}.zip`,
      '    sha512: digest'
    ].join('\n')
    mocks.netFetch
      .mockResolvedValueOnce({ ok: true, text: async () => manifest })
      .mockResolvedValueOnce({ ok: true, body: {} })
    const send = vi.fn()

    await new ArcaMacUpdate(send).check(true)

    expect(mocks.netFetch).toHaveBeenNthCalledWith(
      2,
      `https://mainframe.arcatech.com.br/api/arca/desktop/updates/stable/arca-macos-1.5.2-${process.arch}.zip`,
      expect.objectContaining({
        headers: { Authorization: 'Bearer device' },
        redirect: 'error'
      })
    )
    expect(mocks.verify).toHaveBeenCalledWith('/tmp/arca-update-test/update.zip', 'digest')
    expect(send).toHaveBeenLastCalledWith({
      state: 'downloaded',
      version: '1.5.2'
    })
  })

  it.each([
    [404, 'arca-updater:server-unavailable'],
    [401, 'arca-updater:feed-access-denied'],
    [403, 'arca-updater:feed-access-denied']
  ])('keeps automatic HTTP %i feed failures neutral and explains manual failures', async (status, message) => {
    mocks.netFetch.mockResolvedValue({ ok: false, status })
    const automaticSend = vi.fn()
    await new ArcaMacUpdate(automaticSend).check(false)
    expect(automaticSend).toHaveBeenLastCalledWith({ state: 'idle' })

    const manualSend = vi.fn()
    await new ArcaMacUpdate(manualSend).check(true)
    expect(manualSend).toHaveBeenLastCalledWith({ state: 'error', message, userInitiated: true })
  })

  it.each(['fetch failed', 'getaddrinfo ENOTFOUND mainframe', 'request timed out'])(
    'keeps automatic transport failure %s neutral',
    async (message) => {
      mocks.netFetch.mockRejectedValue(new Error(message))
      const send = vi.fn()
      await new ArcaMacUpdate(send).check(false)
      expect(send).toHaveBeenLastCalledWith({ state: 'idle' })
    }
  )

  it('keeps SHA512 failures visible', async () => {
    const manifest = [
      'version: 1.5.2',
      'files:',
      `  - url: arca-macos-1.5.2-${process.arch}.zip`,
      '    sha512: digest'
    ].join('\n')
    mocks.netFetch
      .mockResolvedValueOnce({ ok: true, text: async () => manifest })
      .mockResolvedValueOnce({ ok: true, body: {} })
    mocks.verify.mockRejectedValue(new Error('sha512 checksum mismatch'))
    const send = vi.fn()
    await new ArcaMacUpdate(send).check(false)
    expect(send).toHaveBeenLastCalledWith({
      state: 'error',
      message: 'sha512 checksum mismatch',
      userInitiated: false
    })
  })

  it('runs cleanup before launching the staged installer and quitting', async () => {
    const manifest = [
      'version: 1.5.2',
      'files:',
      `  - url: arca-macos-1.5.2-${process.arch}.zip`,
      '    sha512: digest'
    ].join('\n')
    mocks.netFetch
      .mockResolvedValueOnce({ ok: true, text: async () => manifest })
      .mockResolvedValueOnce({ ok: true, body: {} })
    const cleanup = vi.fn()
    const updater = new ArcaMacUpdate(vi.fn())
    await updater.check(false)

    await updater.install(cleanup)

    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(cleanup.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.launch.mock.invocationCallOrder[0]
    )
    expect(mocks.launch).toHaveBeenCalledWith(
      '/Applications/ARCA.app',
      '/tmp/arca-update-test/extracted/ARCA.app'
    )
    expect(mocks.appQuit).toHaveBeenCalledTimes(1)
  })
})
