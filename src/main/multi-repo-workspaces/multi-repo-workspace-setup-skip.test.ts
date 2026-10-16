import { recoverMultiRepoSetup } from './multi-repo-workspace-setup'
import { retryMultiRepoSetup } from './multi-repo-workspace-setup-retry'
import { randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { MultiRepoTask } from '../../shared/multi-repo-workspaces/multi-repo-workspace-contract'
import type { Repo } from '../../shared/repo-types'
import { gitExecFileAsync } from '../git/runner'
import { addWorktree } from '../git/worktree'
import { mergeWorktreeMetaForWrite } from '../persistence/loading-store/worktree-meta-write-normalization'
import { MultiRepoWorkspaceStore } from './multi-repo-workspace-store'
import { bindMultiRepoWorkspaceOwner } from './multi-repo-workspace-placement'
import { planMultiRepoWorkspace } from './multi-repo-workspace-plan'
import { multiRepoRootFiles } from './multi-repo-workspace-root-files'
import { skipMultiRepoSetup } from './multi-repo-workspace-setup-skip'

let root: string
let repo: Repo
let task: MultiRepoTask
let journal: MultiRepoWorkspaceStore
let unbind: () => void
let registered = true
const store = {
  getRepo: () => repo,
  getWorktreeMeta: () =>
    registered
      ? mergeWorktreeMetaForWrite(undefined, {
          instanceId: task.members[0].instanceId,
          preserveBranchOnDelete: true,
          orcaCreationWorkspaceLayout: { path: task.plan.rootPath, nestWorkspaces: false }
        })
      : undefined
}
const wait = vi.fn(async () => ({ exitCode: 1 }))
const skip = () =>
  skipMultiRepoSetup({
    taskId: task.taskId,
    repoId: repo.id,
    revision: task.revision,
    journal,
    store,
    runtime: { waitForSetupTerminalCompletion: wait }
  })

beforeEach(async () => {
  registered = true
  wait.mockReset().mockResolvedValue({ exitCode: 1 })
  root = await realpath(await mkdtemp(join(tmpdir(), 'orca-setup-skip-')))
  const path = join(root, 'source')
  await mkdir(path)
  await gitExecFileAsync(['init', '--quiet'], { cwd: path })
  await gitExecFileAsync(
    [
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      '-c',
      'commit.gpgSign=false',
      'commit',
      '--allow-empty',
      '-qm',
      'initial'
    ],
    { cwd: path }
  )
  repo = { id: 'api', path, displayName: 'API', badgeColor: '', addedAt: 0 }
  const plan = await planMultiRepoWorkspace({
    store,
    parentPath: root,
    directoryName: 'task',
    members: [
      {
        repoId: repo.id,
        directoryName: 'api',
        baseRef: 'HEAD',
        branchName: 'task/a',
        setupDecision: 'run'
      }
    ]
  })
  const taskId = randomUUID()
  const instanceId = randomUUID()
  task = {
    schemaVersion: 1,
    taskId,
    requestId: taskId,
    revision: 0,
    profileId: 'profile',
    hostId: 'local',
    name: 'Task',
    prompt: '',
    plan,
    root: { state: 'created' },
    agent: { state: 'pending' },
    members: [
      {
        repoId: repo.id,
        state: 'registered',
        setup: 'failed',
        instanceId,
        plannedInstanceId: instanceId,
        worktreeId: `${repo.id}::${plan.members[0].worktreePath}`,
        preparation: { state: 'finished', warning: 'include warning' },
        setupTerminalHandle: 'original-setup'
      }
    ]
  }
  await mkdir(plan.rootPath)
  for (const [name, content] of Object.entries(multiRepoRootFiles(task))) {
    await writeFile(join(plan.rootPath, name), content)
  }
  const member = plan.members[0]
  await addWorktree(path, member.worktreePath, member.branchName, member.baseCommit)
  journal = new MultiRepoWorkspaceStore(join(root, 'profile'), 'profile')
  unbind = bindMultiRepoWorkspaceOwner(store, journal)
  task = journal.save(task, null)
})
afterEach(async () => {
  unbind()
  await rm(root, { recursive: true, force: true })
})

it.each([0, 1])(
  'records the verified exit %s without restarting setup or the Agent',
  async (exitCode) => {
    wait.mockResolvedValueOnce({ exitCode })
    const result = await skip()
    expect(wait).toHaveBeenCalledWith('original-setup', expect.any(AbortSignal), undefined)
    expect(result.members[0]).toMatchObject({
      state: 'ready',
      setup: exitCode === 0 ? 'succeeded' : 'skipped',
      error: 'include warning'
    })
    expect(result.agent).toEqual(task.agent)
    const reopened = new MultiRepoWorkspaceStore(join(root, 'profile'), 'profile')
    expect(reopened.get(task.taskId)).toEqual(result)
  }
)

it.each([
  'unknown',
  'running',
  'preparation',
  'handle',
  'stale-preview',
  'missing',
  'changed-during-wait',
  'marker'
] as const)('keeps the task unchanged when skip is unsafe (%s)', async (cause) => {
  if (cause === 'preparation') {
    task.members[0].preparation = undefined
  }
  if (cause === 'handle') {
    task.members[0].setupTerminalHandle = undefined
  }
  if (cause === 'running') {
    task.members[0].setup = 'running'
  }
  task = journal.save(task, task.revision)
  if (cause === 'stale-preview') {
    task.revision -= 1
  }
  if (cause === 'missing') {
    registered = false
  }
  if (cause === 'unknown') {
    wait.mockRejectedValueOnce(new Error('terminal_handle_stale'))
  }
  if (cause === 'changed-during-wait') {
    wait.mockImplementationOnce(async () => {
      registered = false
      return { exitCode: 1 }
    })
  }
  if (cause === 'marker') {
    await writeFile(join(task.plan.rootPath, '.orca-multi-repo.json'), '{}')
  }
  const before = journal.get(task.taskId)
  await expect(skip()).rejects.toThrow()
  expect(journal.get(task.taskId)).toEqual(before)
  if (!['unknown', 'changed-during-wait'].includes(cause)) {
    expect(wait).not.toHaveBeenCalled()
  }
})

it('uses the durable exit receipt when the original terminal has already gone', async () => {
  task.members[0].setupExitCode = 7
  task = journal.save(task, task.revision)
  wait.mockRejectedValueOnce(new Error('terminal_handle_stale'))
  const result = await skip()
  expect(result.members[0].setup).toBe('skipped')
  expect(wait).not.toHaveBeenCalled()
})

const retryLaunch = vi.fn<(task: MultiRepoTask, repoId: string, token: string) => Promise<string>>(
  async (_task, _repoId, token) => `term_${token}`
)
const retry = () =>
  retryMultiRepoSetup({
    taskId: task.taskId,
    repoId: repo.id,
    revision: task.revision,
    journal,
    store,
    runtime: { waitForSetupTerminalCompletion: wait },
    prepareSetupRetry: async (task, repoId, token) => () => retryLaunch(task, repoId, token),
    isClosing: () => false
  })

it('persists a fresh intent before retrying and observes only the new terminal', async () => {
  retryLaunch.mockImplementationOnce(async (saved, repoId, token) => {
    expect(journal.get(task.taskId)?.members[0]).toMatchObject({
      setup: 'running',
      setupCompletionToken: token
    })
    expect(saved.members[0]).toMatchObject({ setup: 'running', setupCompletionToken: token })
    expect(saved.members[0].setupTerminalHandle).toBe(`term_${token}`)
    expect(saved.members[0].setupExitCode).toBeUndefined()
    expect(repoId).toBe(repo.id)
    return `term_${token}`
  })
  wait.mockResolvedValueOnce({ exitCode: 7 }).mockResolvedValueOnce({ exitCode: 0 })
  const result = await retry()
  expect(result.members[0]).toMatchObject({ setup: 'succeeded', state: 'ready', setupExitCode: 0 })
  expect(wait).toHaveBeenLastCalledWith(
    `term_${result.members[0].setupCompletionToken}`,
    expect.any(AbortSignal),
    result.members[0].setupCompletionToken
  )
  expect(result.agent).toEqual(task.agent)
})

it('does not replay after a lost retry launch response', async () => {
  retryLaunch.mockRejectedValueOnce(new Error('lost launch response'))
  await expect(retry()).rejects.toThrow('lost launch response')
  const saved = journal.get(task.taskId)
  expect(saved?.members[0]).toMatchObject({ setup: 'running' })
  expect(saved?.members[0].setupTerminalHandle).toBe(
    `term_${saved?.members[0].setupCompletionToken}`
  )
  if (!saved) {
    throw new Error('Missing task')
  }
  task = saved
  retryLaunch.mockClear()
  await expect(retry()).rejects.toThrow()
  expect(retryLaunch).not.toHaveBeenCalled()
  wait.mockResolvedValueOnce({ exitCode: 0 })
  const recovered = await recoverMultiRepoSetup({
    task,
    journal,
    store,
    runtime: { waitForSetupTerminalCompletion: wait },
    isClosing: () => false
  })
  expect(recovered.members[0]).toMatchObject({
    error: 'include warning',
    setup: 'succeeded',
    state: 'ready',
    setupExitCode: 0
  })
  expect(wait).toHaveBeenLastCalledWith(
    task.members[0].setupTerminalHandle,
    expect.any(AbortSignal),
    task.members[0].setupCompletionToken
  )
  expect(retryLaunch).not.toHaveBeenCalled()
})

it('does not retry an unverifiable original terminal or a successful setup', async () => {
  retryLaunch.mockClear()
  wait.mockRejectedValueOnce(new Error('unverifiable'))
  await expect(retry()).rejects.toThrow('unverifiable')
  expect(retryLaunch).not.toHaveBeenCalled()
  wait.mockResolvedValueOnce({ exitCode: 0 })
  const result = await retry()
  expect(result.members[0].setup).toBe('succeeded')
  expect(retryLaunch).not.toHaveBeenCalled()
})

it('does not launch when the retry intent cannot be saved', async () => {
  retryLaunch.mockClear()
  const save = vi.spyOn(journal, 'save').mockImplementationOnce(() => {
    throw new Error('disk full')
  })
  try {
    await expect(retry()).rejects.toThrow('disk full')
    expect(retryLaunch).not.toHaveBeenCalled()
  } finally {
    save.mockRestore()
  }
})

it('leaves the previous failure intact if runner preparation fails', async () => {
  const before = journal.get(task.taskId)
  await expect(
    retryMultiRepoSetup({
      taskId: task.taskId,
      repoId: repo.id,
      revision: task.revision,
      journal,
      store,
      runtime: { waitForSetupTerminalCompletion: wait },
      prepareSetupRetry: async () => {
        throw new Error('runner unavailable')
      },
      isClosing: () => false
    })
  ).rejects.toThrow('runner unavailable')
  expect(journal.get(task.taskId)).toEqual(before)
})

it('keeps the intended handle when a launch reply names a different terminal', async () => {
  retryLaunch.mockResolvedValueOnce('unexpected-terminal')
  await expect(retry()).rejects.toThrow('Setup retry terminal identity changed')
  const saved = journal.get(task.taskId)
  expect(saved?.members[0].setupTerminalHandle).toBe(
    `term_${saved?.members[0].setupCompletionToken}`
  )
  expect(saved?.members[0].setup).toBe('running')
})

it.each(['missing-preparation', 'different-handle'] as const)(
  'does not observe an unverified initial setup intent (%s)',
  async (cause) => {
    task.members[0].setup = 'pending'
    task.members[0].setupCompletionToken = randomUUID()
    task.members[0].setupTerminalHandle = `term_${task.members[0].setupCompletionToken}`
    if (cause === 'missing-preparation') {
      task.members[0].preparation = undefined
    } else {
      task.members[0].setupTerminalHandle = 'unrelated-terminal'
    }
    task = journal.save(task, task.revision)
    const recovered = await recoverMultiRepoSetup({
      task,
      journal,
      store,
      runtime: { waitForSetupTerminalCompletion: wait },
      isClosing: () => false
    })
    expect(recovered).toEqual(task)
    expect(wait).not.toHaveBeenCalled()
  }
)

it.each([
  'valid',
  'inherit-receipt',
  'run-no-hook',
  'missing-preparation',
  'missing-registration',
  'changed-marker'
] as const)('recovers an explicit skip after losing the creation reply (%s)', async (cause) => {
  unbind()
  journal = new MultiRepoWorkspaceStore(join(root, 'skip-profile'), 'profile')
  unbind = bindMultiRepoWorkspaceOwner(store, journal)
  task.plan.members[0].setupDecision =
    cause === 'inherit-receipt' ? 'inherit' : cause === 'run-no-hook' ? 'run' : 'skip'
  if (cause === 'inherit-receipt' || cause === 'run-no-hook') {
    task.members[0].setupNotStarted = true
  }
  const member = task.members[0]
  member.setup = 'pending'
  member.setupCompletionToken = randomUUID()
  member.setupTerminalHandle = `term_${member.setupCompletionToken}`
  member.error = 'Creation reply was lost'
  for (const [name, content] of Object.entries(multiRepoRootFiles(task))) {
    await writeFile(join(task.plan.rootPath, name), content)
  }
  if (cause === 'missing-preparation') {
    member.preparation = undefined
  }
  if (cause === 'missing-registration') {
    registered = false
  }
  if (cause === 'changed-marker') {
    await writeFile(join(task.plan.rootPath, '.orca-multi-repo.json'), '{}')
  }
  task = journal.save(task, null)
  const recovered = await recoverMultiRepoSetup({
    task,
    journal,
    store,
    runtime: { waitForSetupTerminalCompletion: wait },
    isClosing: () => false
  })
  expect(wait).not.toHaveBeenCalled()
  expect(recovered.agent.state).toBe('pending')
  expect(recovered.members[0].instanceId).toBe(member.instanceId)
  if (cause === 'valid' || cause === 'inherit-receipt' || cause === 'run-no-hook') {
    expect(recovered.members[0]).toMatchObject({
      state: 'ready',
      setup: 'skipped',
      error: 'include warning'
    })
    expect(recovered.members[0].setupTerminalHandle).toBeUndefined()
  } else {
    expect(recovered.members[0].setup).toBe('pending')
    expect(recovered.members[0].state).not.toBe('ready')
  }
})
