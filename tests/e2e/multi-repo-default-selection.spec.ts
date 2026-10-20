import { expect, test } from './helpers/orca-app'
import { waitForSessionReady } from './helpers/store'

test('new requirements reuse repository defaults with fresh branch names', async ({
  orcaPage: page
}) => {
  await waitForSessionReady(page)
  await page.evaluate(() => window.__store!.getState().updateSettings({ uiLanguage: 'en' }))
  await page.getByRole('button', { name: 'Manage requirements', exact: true }).click()
  await page.getByRole('button', { name: 'New task', exact: true }).click()
  await page.getByRole('combobox', { name: 'Repositories (across project groups)' }).click()
  await page.getByRole('button', { name: 'All projects', exact: true }).click()
  await page.keyboard.press('Escape')
  await page.getByLabel('Task name', { exact: true }).fill('First requirement')
  await page.getByText('Advanced settings and workspace presets', { exact: true }).click()
  const firstBranch = await page.getByLabel('New branch', { exact: true }).inputValue()
  await page.getByRole('button', { name: 'Save as defaults for new tasks' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Defaults saved for new tasks.' })
  ).toBeVisible()
  const saved = await page.evaluate(() => window.api.multiRepoWorkspaces.defaults())
  expect(saved.repositoryIds).toHaveLength(1)
  await page.getByRole('button', { name: 'View existing tasks' }).click()
  await page.getByRole('button', { name: 'New task', exact: true }).click()
  await expect(
    page.getByRole('combobox', { name: 'Repositories (across project groups)' })
  ).toHaveText('All projects')
  await page.getByLabel('Task name', { exact: true }).fill('Second requirement')
  await page.getByText('Advanced settings and workspace presets', { exact: true }).click()
  const nextBranch = await page.getByLabel('New branch', { exact: true }).inputValue()
  expect(nextBranch).toMatch(/^task\/second-requirement-/)
  expect(nextBranch).not.toBe(firstBranch)
})
