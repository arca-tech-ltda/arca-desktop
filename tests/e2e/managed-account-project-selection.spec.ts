import { test, expect } from './helpers/orca-app'
import { waitForSessionReady } from './helpers/store'

/** Managed authority (the partners' machines): the same surfaces list Claude/Codex accounts. */
test('managed project account submenu and badge', async ({ orcaPage, seededRepoPath }, testInfo) => {
  await waitForSessionReady(orcaPage)
  await orcaPage.evaluate(async () => {
    const now = Date.now()
    await window.api.settings.set({
      agentAuthority: 'managed',
      claudeManagedAccounts: [
        {
          id: 'claude-work',
          email: 'work@arca.com',
          managedAuthPath: '/tmp/arca-fased-claude/claude-work/auth',
          authMethod: 'subscription-oauth',
          createdAt: now,
          updatedAt: now,
          lastAuthenticatedAt: now
        },
        {
          id: 'claude-cliente-x',
          email: 'cliente-x@arca.com',
          managedAuthPath: '/tmp/arca-fased-claude/claude-cliente-x/auth',
          authMethod: 'subscription-oauth',
          createdAt: now,
          updatedAt: now,
          lastAuthenticatedAt: now
        }
      ],
      codexManagedAccounts: [
        {
          id: 'codex-work',
          email: 'codex@arca.com',
          managedHomePath: '/tmp/arca-fased-codex/codex-work/home',
          createdAt: now,
          updatedAt: now,
          lastAuthenticatedAt: now
        }
      ]
    })
  })
  await expect
    .poll(async () => (await orcaPage.evaluate(() => window.api.agentAuthority.get())).mode)
    .toBe('managed')

  await orcaPage.evaluate(
    (project: string) =>
      window.api.managedAccountProjects.set(project, 'claude', 'claude-cliente-x'),
    seededRepoPath
  )
  const badge = orcaPage.locator('[data-testid="pi-account-project-badge"]').first()
  await expect(badge).toBeVisible({ timeout: 15_000 })
  await expect(badge).toHaveText('cliente-x@arca.com')
  await orcaPage.screenshot({ path: testInfo.outputPath('arca-fased-managed-badge.png') })

  // The ⋯ button only reveals on hover over the project row.
  await badge.hover()
  await orcaPage.locator('[data-repo-header-actions] button').first().click()
  const submenu = orcaPage.locator('[data-testid="pi-account-project-submenu"]')
  await expect(submenu).toBeVisible({ timeout: 10_000 })
  await submenu.hover()
  await expect(orcaPage.getByText('Claude', { exact: true })).toBeVisible({ timeout: 10_000 })
  await orcaPage.getByText('Claude', { exact: true }).hover()
  await expect(orcaPage.getByText('cliente-x@arca.com').first()).toBeVisible({ timeout: 10_000 })
  await orcaPage.waitForTimeout(600)
  await orcaPage.screenshot({ path: testInfo.outputPath('arca-fased-managed-submenu.png') })
})
