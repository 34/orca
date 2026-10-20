import assert from 'node:assert/strict'
import { lstat, readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { tsImport } from 'tsx/esm/api'
import { readInstallTransaction } from './orca34-install-transaction.mjs'
import { writeInstallReceipt } from './orca34-install-snapshot.mjs'
import { verifyOrca34InstallCandidate } from './verify-orca34-install-candidate.mjs'
import { assertMacInstallStopped } from './orca34-install-idle.mjs'

export function assertInstalledRuntime(runtime, state, manifest) {
  assert.equal(runtime.packaged, true, 'Health check must run the packaged application')
  assert.equal(runtime.executable, join(state.target, 'Contents', 'MacOS', 'Orca 34'))
  assert.equal(runtime.userData, state.profile, 'Health check opened the wrong profile')
  assert.equal(runtime.version, manifest.version, 'Health check started a different version')
  assert(
    runtime.windows.length > 0 &&
      runtime.windows.every((window) => !window.visible && !window.focused),
    'Health check must remain hidden and unfocused'
  )
}

export function taskHealthIdentity(task) {
  return {
    taskId: task.taskId,
    profileId: task.profileId,
    name: task.name,
    prompt: task.prompt,
    context: task.context,
    plan: task.plan,
    rootState: task.root.state,
    members: task.members.map(({ repoId, state }) => ({ repoId, state }))
  }
}

export function assertRetainedTasks(before, after) {
  const actual = new Map(after.map((task) => [task.taskId, taskHealthIdentity(task)]))
  assert.equal(actual.size, after.length, 'Health check returned duplicate task identities')
  for (const task of before) {
    assert.deepEqual(
      actual.get(task.taskId),
      taskHealthIdentity(task),
      `Existing task changed during upgrade: ${task.taskId}`
    )
  }
}

async function readSavedTasks(userData, profileId, schema) {
  assert.match(profileId, /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/)
  const tasks = join(userData, 'profiles', profileId, 'multi-repo-workspaces', 'tasks')
  let names
  try {
    names = await readdir(tasks)
  } catch (error) {
    if (error.code === 'ENOENT') {
      return []
    }
    throw error
  }
  return Promise.all(
    names
      .filter((name) => name.endsWith('.json'))
      .map(async (name) => schema.parse(JSON.parse(await readFile(join(tasks, name), 'utf8'))))
  )
}

async function inspectInstalledApplication(state, manifest) {
  const { _electron } = await import('@playwright/test')
  const { multiRepoTaskSchema } = await tsImport(
    '../../src/shared/multi-repo-workspaces/multi-repo-workspace-contract.ts',
    import.meta.url
  )
  const env = {
    ...process.env,
    ORCA_BACKGROUND_LAUNCH: '1',
    ORCA34_INSTALL_HEALTH_CHECK: '1'
  }
  for (const key of ['ELECTRON_RUN_AS_NODE', 'ORCA_DEV_USER_DATA_PATH', 'ORCA_USER_DATA_PATH']) {
    delete env[key]
  }
  if (env.ORCA_E2E_USER_DATA_DIR && env.ORCA_E2E_USER_DATA_DIR !== state.profile) {
    throw new Error('Isolated health profile does not match the installation')
  }
  const args = ['-ApplePersistenceIgnoreState', 'YES', `--user-data-dir=${state.profile}`]
  if (env.ORCA_E2E_USER_DATA_DIR) {
    args.push('--password-store=basic', '--use-mock-keychain')
  }
  const application = await _electron.launch({
    executablePath: join(state.target, 'Contents', 'MacOS', 'Orca 34'),
    args,
    env,
    timeout: 60_000
  })
  try {
    const page = await application.firstWindow()
    await page.waitForFunction(() =>
      Boolean(
        document.body?.dataset.orca34InstallHealth === '1' &&
        window.api?.multiRepoWorkspaces &&
        window.api?.orcaProfiles
      )
    )
    const runtime = await application.evaluate(({ app, BrowserWindow }) => ({
      packaged: app.isPackaged,
      executable: process.execPath,
      userData: app.getPath('userData'),
      version: app.getVersion(),
      windows: BrowserWindow.getAllWindows().map((window) => ({
        visible: window.isVisible(),
        focused: window.isFocused()
      }))
    }))
    assertInstalledRuntime(runtime, state, manifest)
    const observed = await page.evaluate(async () => ({
      profiles: await window.api.orcaProfiles.list(),
      tasks: await window.api.multiRepoWorkspaces.list()
    }))
    const tasks = observed.tasks.map((task) => multiRepoTaskSchema.parse(task))
    const baseline = join(state.directory, 'previous-profile', 'contents')
    const before = await readSavedTasks(
      baseline,
      observed.profiles.activeProfileId,
      multiRepoTaskSchema
    )
    assertRetainedTasks(before, tasks)
    const retainedProfiles = []
    let directories = []
    try {
      directories = await readdir(join(baseline, 'profiles'), { withFileTypes: true })
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error
      }
    }
    for (const entry of directories.filter((entry) => entry.isDirectory())) {
      const saved = await readSavedTasks(baseline, entry.name, multiRepoTaskSchema)
      const current = await readSavedTasks(state.profile, entry.name, multiRepoTaskSchema)
      assertRetainedTasks(saved, current)
      retainedProfiles.push({ profileId: entry.name, taskCount: saved.length })
    }
    for (const task of tasks) {
      if (task.root.state === 'created') {
        assert((await lstat(task.plan.rootPath)).isDirectory(), 'Existing task root is missing')
      }
      for (const member of task.members.filter((member) => member.state === 'ready')) {
        const planned = task.plan.members.find((entry) => entry.repoId === member.repoId)
        assert(
          (await lstat(planned.worktreePath)).isDirectory(),
          'Existing member workspace is missing'
        )
      }
    }
    return {
      runtime,
      activeProfileId: observed.profiles.activeProfileId,
      retainedTaskCount: before.length,
      observedTaskCount: tasks.length,
      taskIds: tasks.map((task) => task.taskId),
      retainedProfiles
    }
  } finally {
    await application.close()
  }
}

export async function checkLocalInstallHealth(directory) {
  const state = await readInstallTransaction(directory)
  assert.equal(state.phase, 'installed', 'Health check requires an installed candidate')
  const { manifest } = verifyOrca34InstallCandidate(state.target, state.commit)
  const { acquireOrca34UpgradeLease } = await tsImport(
    '../../src/main/startup/orca34-install-access.ts',
    import.meta.url
  )
  const preflight = acquireOrca34UpgradeLease(state.target, state.profile)
  try {
    await assertMacInstallStopped(state)
    preflight.assertActive()
  } finally {
    preflight.release()
  }
  const evidence = { commit: state.commit, checkedAt: new Date().toISOString(), status: 'failed' }
  try {
    Object.assign(evidence, await inspectInstalledApplication(state, manifest), {
      status: 'passed'
    })
  } catch (error) {
    evidence.error = error instanceof Error ? error.message : String(error)
  }
  const record = `health-${randomUUID()}.json`
  await writeInstallReceipt(join(directory, record), evidence)
  const completion = acquireOrca34UpgradeLease(state.target, state.profile)
  try {
    await assertMacInstallStopped(state)
    completion.assertActive()
    const current = await readInstallTransaction(directory)
    assert.equal(current.phase, 'installed')
    assert.equal(current.commit, state.commit)
    verifyOrca34InstallCandidate(current.target, current.commit)
    await writeInstallReceipt(join(directory, 'transaction.json'), {
      ...current,
      health: {
        status: evidence.status,
        record,
        checkedAt: evidence.checkedAt,
        commit: state.commit
      }
    })
  } finally {
    completion.release()
  }
  assert.equal(
    evidence.status,
    'passed',
    `Installation health check failed; see ${join(directory, record)}: ${evidence.error ?? ''}`
  )
  return evidence
}
