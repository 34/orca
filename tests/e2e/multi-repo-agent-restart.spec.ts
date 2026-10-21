import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { expect, test } from './helpers/orca-app'
import { waitForSessionReady } from './helpers/store'
import { configureGoldenStubAgent, getGoldenStubAgentLaunchEnv } from './helpers/golden-stub-agent'

test.use({ launchEnv: getGoldenStubAgentLaunchEnv() })
test('restarts a root agent from requirement details with its saved arguments', async ({
  orcaPage: page
}) => {
  await waitForSessionReady(page)
  await configureGoldenStubAgent(page)
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'orca-restart-e2e-')))
  const taskId = randomUUID()
  try {
    const task = await page.evaluate(
      async ({ parent, taskId }) => {
        const repos = await window.api.repos.list()
        await window.api.multiRepoWorkspaces.create({
          requestId: taskId,
          name: 'Restart proof',
          prompt: 'Wait for the next instruction.',
          parentPath: parent,
          directoryName: 'task',
          agent: 'codex',
          context: {
            rules: '',
            agentInstructions: '',
            agentArgs: '--model restart-proof --codex-ready-transcript',
            pluginNotes: '',
            skills: [],
            attachments: []
          },
          members: [
            {
              repoId: repos[0].id,
              directoryName: 'repo',
              baseRef: 'HEAD',
              branchName: `task/restart-${taskId}`,
              setupDecision: 'skip'
            }
          ]
        })
        return window.api.multiRepoWorkspaces.continue(taskId)
      },
      { parent, taskId }
    )
    expect(task.agent.state, task.agent.error).toBe('started')
    await page.getByRole('button', { name: 'Manage requirements', exact: true }).click()
    await page.getByRole('button', { name: 'Restart proof', exact: true }).click()
    await page.getByRole('button', { name: 'Restart root agent', exact: true }).click()
    await page
      .getByRole('dialog', { name: 'Restart root agent', exact: true })
      .getByRole('button', { name: 'Restart root agent', exact: true })
      .click()
    await expect
      .poll(
        async () => {
          const current = await page.evaluate(
            (id) => window.api.multiRepoWorkspaces.get(id),
            taskId
          )
          return (
            current?.agent.state === 'started' &&
            current.agent.operationId !== task.agent.operationId
          )
        },
        { timeout: 30000 }
      )
      .toBe(true)
    const restarted = await page.evaluate((id) => window.api.multiRepoWorkspaces.get(id), taskId)
    expect(restarted?.agent.launchArgs).toBe('--model restart-proof --codex-ready-transcript')
    expect(restarted?.members).toEqual(task.members)
  } finally {
    await page.evaluate((id) => window.api.multiRepoWorkspaces.stopRootForCleanup(id), taskId)
    await rm(parent, { recursive: true, force: true })
  }
})
