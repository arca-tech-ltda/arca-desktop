import { mkdirSync, writeFileSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect } from './helpers/orca-app'
import { waitForSessionReady } from './helpers/store'

const agentDir = mkdtempSync(path.join(os.tmpdir(), 'arca-accproj-agent-'))
mkdirSync(agentDir, { recursive: true })
writeFileSync(
  path.join(agentDir, 'accounts.json'),
  JSON.stringify({
    version: 1,
    active: { anthropic: 'work' },
    accounts: {
      anthropic: {
        work: { type: 'oauth', access: 'a', refresh: 'r', expires: 4102444800000 },
        'cliente-x': { type: 'oauth', access: 'b', refresh: 's', expires: 4102444800000 }
      },
      'openai-codex': {
        'codex-work': { type: 'oauth', access: 'c', refresh: 't', expires: 4102444800000 }
      }
    }
  })
)
writeFileSync(path.join(agentDir, 'auth.json'), '{}')

test.use({
  orcaAppExtraEnv: {
    PI_CODING_AGENT_DIR: agentDir,
    ARCA_FORCE_PI_ACCOUNT_SUPPORT: '1',
    PI_ACCOUNTS_MIRROR: '0'
  }
})

test('project account submenu and badge', async ({ orcaPage, seededRepoPath }, testInfo) => {
  await waitForSessionReady(orcaPage)
  const repoPath = seededRepoPath
  await orcaPage.evaluate(
    (project: string) => window.api.piAccountProjects.set(project, 'anthropic', 'cliente-x'),
    repoPath
  )
  const badge = orcaPage.locator('[data-testid="pi-account-project-badge"]').first()
  await expect(badge).toBeVisible({ timeout: 15_000 })
  await orcaPage.screenshot({ path: testInfo.outputPath('arca-accproj-badge.png') })

  // The ⋯ button only reveals on hover over the project row.
  await badge.hover()
  const header = orcaPage.locator('[data-repo-header-actions] button').first()
  await header.click()
  const submenu = orcaPage.locator('[data-testid="pi-account-project-submenu"]')
  await expect(submenu).toBeVisible({ timeout: 10_000 })
  await submenu.hover()
  await expect(orcaPage.getByText('Claude', { exact: true })).toBeVisible({ timeout: 10_000 })
  await orcaPage.getByText('Claude', { exact: true }).hover()
  await expect(orcaPage.getByText('Active account (default)')).toBeVisible({ timeout: 10_000 })
  await orcaPage.waitForTimeout(600)
  await orcaPage.screenshot({ path: testInfo.outputPath('arca-accproj-submenu.png') })
})
