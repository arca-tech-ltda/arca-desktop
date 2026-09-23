/**
 * ARCA Desktop ships no update feed of its own and must never pull builds from upstream Orca.
 *
 * The switch lives at the public `src/main/updater.ts` boundary: nothing behind it checks,
 * downloads, or installs. The test-only override keeps the inherited updater suite usable.
 */
export const ARCA_AUTO_UPDATES_ENABLED = false

export const AUTO_UPDATES_TEST_OVERRIDE_ENV = 'ARCA_AUTO_UPDATES_TEST_OVERRIDE'

export function areAutoUpdatesEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    ARCA_AUTO_UPDATES_ENABLED ||
    (env.NODE_ENV === 'test' && env[AUTO_UPDATES_TEST_OVERRIDE_ENV] === '1')
  )
}
