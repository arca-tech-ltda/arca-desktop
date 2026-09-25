import { app, net } from 'electron'
import { mkdtemp, rm } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { parse } from 'yaml'
import type { UpdateStatus } from '../../shared/update-status-types'
import { object } from '../arca-megamind/credentials'
import { compareVersions } from '../updater-fallback'
import { MEGAMIND_UPDATE_REQUIRED, readArcaUpdateFeed, updateArtifactUrl } from './arca-update-feed'
import {
  arcaUpdateFeedUnavailableMessage,
  retryArcaUpdateNetwork
} from './arca-update-feed-failure'
import {
  extractMacUpdate,
  launchMacInstaller,
  verifyUpdateSha512,
  writableMacTarget
} from './arca-mac-install'

export class ArcaMacUpdate {
  private manifestCache: { manifest: unknown; at: number; url: string } | null = null
  private busy = false
  private staged: string | null = null
  private directory: string | null = null
  private version = ''
  private cancellation: AbortController | null = null

  cancelDownload(): void {
    this.cancellation?.abort()
  }

  constructor(private readonly send: (status: UpdateStatus) => void) {}

  async download(): Promise<void> {
    await this.check(true, true)
  }

  async check(userInitiated: boolean, downloadRequested = false): Promise<void> {
    if (this.busy) {
      return
    }
    if (this.staged) {
      this.send({ state: 'downloaded', version: this.version })
      return
    }
    this.busy = true
    try {
      const feed = await readArcaUpdateFeed()
      if (!feed) {
        throw new Error(MEGAMIND_UPDATE_REQUIRED)
      }
      this.send({ state: 'checking', userInitiated })
      const cached = this.manifestCache
      const manifest: unknown =
        downloadRequested &&
        cached &&
        cached.url === feed.url &&
        Date.now() - cached.at < 10 * 60_000
          ? cached.manifest
          : await retryArcaUpdateNetwork(async () => {
              const response = await net.fetch(updateArtifactUrl(feed, 'latest-mac.yml'), {
                headers: feed.requestHeaders,
                redirect: 'error',
                signal: AbortSignal.timeout(30_000)
              })
              if (!response.ok) {
                throw new Error(`Update feed HTTP ${response.status}`)
              }
              return parse(await response.text())
            })
      if (
        !object(manifest) ||
        typeof manifest.version !== 'string' ||
        !/^\d+\.\d+\.\d+$/.test(manifest.version) ||
        !Array.isArray(manifest.files)
      ) {
        throw new Error('Invalid update manifest')
      }
      if (compareVersions(manifest.version, app.getVersion()) <= 0) {
        this.send({ state: 'not-available', userInitiated })
        return
      }
      const files: unknown[] = manifest.files
      const zip = files.find(
        (file) =>
          object(file) && typeof file.url === 'string' && file.url.endsWith(`-${process.arch}.zip`)
      )
      const dmg = files.find(
        (file) =>
          object(file) && typeof file.url === 'string' && file.url.endsWith(`-${process.arch}.dmg`)
      )
      if (!object(zip) || typeof zip.url !== 'string' || typeof zip.sha512 !== 'string') {
        throw new Error('No update for this Mac architecture')
      }
      this.manifestCache = {
        manifest,
        at: cached?.manifest === manifest ? cached.at : Date.now(),
        url: feed.url
      }
      const url = updateArtifactUrl(feed, zip.url)
      this.version = manifest.version
      this.send({
        state: 'available',
        version: this.version,
        changelog: null,
        releaseDate: typeof manifest.releaseDate === 'string' ? manifest.releaseDate : undefined
      })
      if (!downloadRequested) {
        return
      }
      try {
        await writableMacTarget(process.execPath)
      } catch {
        const link =
          object(dmg) && typeof dmg.url === 'string' ? updateArtifactUrl(feed, dmg.url) : feed.url
        this.send({
          state: 'error',
          message: 'arca-updater:download-dmg',
          manualDownloadUrl: link,
          retryable: false,
          userInitiated
        })
        return
      }
      this.send({ state: 'downloading', version: this.version, percent: 0 })
      this.cancellation = new AbortController()
      this.directory = await mkdtemp(join(tmpdir(), 'arca-update-'))
      const archive = join(this.directory, 'update.zip')
      const cancellation = this.cancellation
      await retryArcaUpdateNetwork(async () => {
        cancellation.signal.throwIfAborted()
        const download = await net.fetch(url, {
          headers: feed.requestHeaders,
          redirect: 'error',
          signal: AbortSignal.any([cancellation.signal, AbortSignal.timeout(30 * 60_000)])
        })
        if (!download.ok || !download.body) {
          throw new Error(`Update download HTTP ${download.status}`)
        }
        let transferred = 0
        const total = Number(download.headers?.get('content-length')) || 0
        const progress = new Transform({
          transform: (chunk, _encoding, callback) => {
            transferred += chunk.length
            this.send({
              state: 'downloading',
              version: this.version,
              transferred,
              total,
              percent: total > 0 ? Math.min(100, Math.round((transferred / total) * 100)) : 0
            })
            callback(null, chunk)
          }
        })
        await pipeline(download.body, progress, createWriteStream(archive, { mode: 0o600 }))
      })
      await verifyUpdateSha512(archive, zip.sha512)
      const staged = await extractMacUpdate(archive, this.directory)
      this.cancellation.signal.throwIfAborted()
      this.staged = staged
      this.send({ state: 'downloaded', version: this.version })
    } catch (error) {
      if (this.directory) {
        await rm(this.directory, { recursive: true, force: true }).catch(() => {})
      }
      this.directory = null
      if (this.cancellation?.signal.aborted) {
        this.send({ state: 'available', version: this.version, changelog: null })
        return
      }
      const feedUnavailableMessage = arcaUpdateFeedUnavailableMessage(error)
      if (feedUnavailableMessage) {
        console.warn('[updater] update request unavailable:', error)
        this.send(
          userInitiated
            ? { state: 'error', message: feedUnavailableMessage, userInitiated: true }
            : { state: 'idle' }
        )
      } else {
        this.send({
          state: 'error',
          message: error instanceof Error ? error.message : 'Update failed',
          userInitiated
        })
      }
    } finally {
      this.busy = false
      this.cancellation = null
    }
  }

  async install(beforeQuit: (() => void | Promise<void>) | null): Promise<void> {
    if (!this.staged || this.busy) {
      return
    }
    this.busy = true
    try {
      const target = await writableMacTarget(process.execPath)
      await beforeQuit?.()
      await launchMacInstaller(target, this.staged)
      app.quit()
    } finally {
      this.busy = false
    }
  }
}
