import { app, net } from 'electron'
import { mkdtemp, rm } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { parse } from 'yaml'
import type { UpdateStatus } from '../../shared/update-status-types'
import { object } from '../arca-megamind/credentials'
import { compareVersions } from '../updater-fallback'
import { MEGAMIND_UPDATE_REQUIRED, readArcaUpdateFeed, updateArtifactUrl } from './arca-update-feed'
import {
  extractMacUpdate,
  launchMacInstaller,
  verifyUpdateSha512,
  writableMacTarget
} from './arca-mac-install'

export class ArcaMacUpdate {
  private busy = false
  private staged: string | null = null
  private directory: string | null = null
  private version = ''

  constructor(private readonly send: (status: UpdateStatus) => void) {}

  async check(userInitiated: boolean): Promise<void> {
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
      const response = await net.fetch(updateArtifactUrl(feed, 'latest-mac.yml'), {
        headers: feed.requestHeaders,
        redirect: 'error',
        signal: AbortSignal.timeout(30_000)
      })
      if (!response.ok) {
        throw new Error(`Update feed HTTP ${response.status}`)
      }
      const manifest: unknown = parse(await response.text())
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
      const url = updateArtifactUrl(feed, zip.url)
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
      this.version = manifest.version
      this.send({ state: 'available', version: this.version, changelog: null })
      this.send({ state: 'downloading', version: this.version, percent: 0 })
      this.directory = await mkdtemp(join(tmpdir(), 'arca-update-'))
      const archive = join(this.directory, 'update.zip')
      const download = await net.fetch(url, {
        headers: feed.requestHeaders,
        redirect: 'error',
        signal: AbortSignal.timeout(30 * 60_000)
      })
      if (!download.ok || !download.body) {
        throw new Error(`Update download HTTP ${download.status}`)
      }
      await pipeline(download.body, createWriteStream(archive, { mode: 0o600 }))
      await verifyUpdateSha512(archive, zip.sha512)
      this.staged = await extractMacUpdate(archive, this.directory)
      this.send({ state: 'downloaded', version: this.version })
    } catch (error) {
      if (this.directory) {
        await rm(this.directory, { recursive: true, force: true }).catch(() => {})
      }
      this.directory = null
      this.send({
        state: 'error',
        message: error instanceof Error ? error.message : 'Update failed',
        userInitiated
      })
    } finally {
      this.busy = false
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
