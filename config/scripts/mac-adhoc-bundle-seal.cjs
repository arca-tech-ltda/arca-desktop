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

/** True while the bundle still carries Electron's ad-hoc signature, i.e. nothing real to preserve. */
function isAdhocMacSignature(codesignOutput) {
  return /^Signature=adhoc$/m.test(codesignOutput)
}

async function sealMacAdhocBundle(appPath) {
  if (!existsSync(appPath)) {
    throw new Error(`Missing macOS app bundle to seal: ${appPath}`)
  }
  // Why the re-check: a machine with a Developer ID in its keychain gets a real
  // signature from electron-builder even off the release path, and re-signing
  // ad-hoc would throw that identity (and its TCC grants) away.
  if (!isAdhocMacSignature(readMacSignature(appPath))) {
    console.log('[mac-adhoc-seal] bundle already carries a real signature; leaving it alone')
    return
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
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' })
  const identifier = readMacSignature(appPath).match(/^Identifier=(.+)$/m)?.[1]
  console.log(`[mac-adhoc-seal] sealed ${appPath} as ${identifier ?? 'unknown identifier'}`)
}

// Why stderr: `codesign -dv` writes its whole report there, not to stdout.
function readMacSignature(appPath) {
  return spawnSync('codesign', ['-dv', appPath], { encoding: 'utf8' }).stderr ?? ''
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

module.exports = { shouldSealMacAdhocBundle, isAdhocMacSignature, sealMacAdhocBundle }
