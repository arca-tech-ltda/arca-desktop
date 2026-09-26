// Seals a macOS app bundle with an ad-hoc signature for builds that have no
// Developer ID.
//
// Why: Electron ships its executable linker-signed ad-hoc under the identifier
// "Electron" with no sealed resources. macOS keys notification records to the
// process's code-signing identifier, so an app whose identifier is "Electron"
// while its Info.plist says br.com.arcatech.arca-desktop is rejected by
// UNUserNotificationCenter with UNErrorDomain 1 ("Notifications are not allowed
// for this application") — no banner, no prompt, no entry in System Settings.
// Sealing the bundle ad-hoc makes codesign derive the identifier from
// CFBundleIdentifier, which is what the notification service accepts. The
// record is keyed by bundle id, not by cdhash, so the grant survives updates.
//
// Hardened runtime must stay off here: an ad-hoc signature carries no team id,
// so library validation refuses to map Electron Framework into the process
// ("mapping process and mapped file (non-platform) have different Team IDs").
const { execFileSync, spawnSync } = require('node:child_process')
const { existsSync } = require('node:fs')
const { dirname } = require('node:path')

const ADHOC_IDENTITY = '-'

/**
 * Release builds are signed and notarized with the Developer ID identity by
 * electron-builder itself; only identity-less builds need the ad-hoc seal.
 * ARCA_MAC_ADHOC_SEAL=0 skips it for fast local iteration.
 */
function shouldSealMacAdhocBundle({ platformName, isMacRelease, env = process.env }) {
  if (platformName !== 'darwin' || isMacRelease) {
    return false
  }
  return env.ARCA_MAC_ADHOC_SEAL !== '0'
}

/**
 * Throws unless the freshly sealed bundle reports the app's own code identifier and
 * passes deep verification — a silent miss here ships an app macOS files under
 * "Electron", which permanently breaks its notification record.
 */
function assertSealedMacAdhocBundle(appPath, expectedIdentifier, commands = codesignCommands) {
  const report = commands.readSignature(appPath)
  const identifier = report.match(/^Identifier=(.+)$/m)?.[1]
  if (identifier !== expectedIdentifier) {
    throw new Error(
      `Ad-hoc seal produced identifier ${identifier ?? '(none)'} for ${appPath}, expected ${expectedIdentifier}`
    )
  }
  commands.verifyBundle(appPath)
  return identifier
}

async function sealMacAdhocBundle(appPath, expectedIdentifier) {
  if (!existsSync(appPath)) {
    throw new Error(`Missing macOS app bundle to seal: ${appPath}`)
  }
  if (!expectedIdentifier) {
    throw new Error(`Ad-hoc seal needs the target bundle identifier for ${appPath}`)
  }
  const { signAsync } = requireOsxSign()
  await signAsync({
    app: appPath,
    identity: ADHOC_IDENTITY,
    identityValidation: false,
    platform: 'darwin',
    // Why: both write Developer ID/provisioning assumptions into the bundle that
    // an ad-hoc signature cannot satisfy.
    preAutoEntitlements: false,
    preEmbedProvisioningProfile: false,
    optionsForFile: () => ({ hardenedRuntime: false, timestamp: 'none' })
  })
  const identifier = assertSealedMacAdhocBundle(appPath, expectedIdentifier)
  console.log(`[mac-adhoc-seal] sealed ${appPath} as ${identifier}`)
}

const codesignCommands = {
  // Why stderr: `codesign -dv` writes its whole report there, not to stdout.
  readSignature(appPath) {
    const result = spawnSync('codesign', ['-dv', appPath], { encoding: 'utf8' })
    if (result.error || result.status !== 0) {
      throw new Error(
        `codesign -dv failed for ${appPath}: ${result.error?.message ?? result.stderr ?? `exit ${result.status}`}`
      )
    }
    return result.stderr ?? ''
  },
  verifyBundle(appPath) {
    execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' })
  }
}

// Why resolved through app-builder-lib: @electron/osx-sign is electron-builder's
// own signer, not a direct dependency, so it may not sit at the root.
function requireOsxSign() {
  try {
    return require('@electron/osx-sign')
  } catch {
    const appBuilderLib = dirname(require.resolve('app-builder-lib/package.json'))
    return require(require.resolve('@electron/osx-sign', { paths: [appBuilderLib] }))
  }
}

module.exports = { shouldSealMacAdhocBundle, assertSealedMacAdhocBundle, sealMacAdhocBundle }
