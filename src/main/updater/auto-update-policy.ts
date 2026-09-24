export const ARCA_AUTO_UPDATES_ENABLED = true

export const AUTO_UPDATES_TEST_OVERRIDE_ENV = 'ARCA_AUTO_UPDATES_TEST_OVERRIDE'

export function areAutoUpdatesEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    ARCA_AUTO_UPDATES_ENABLED ||
    (env.NODE_ENV === 'test' && env[AUTO_UPDATES_TEST_OVERRIDE_ENV] === '1')
  )
}
