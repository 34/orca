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
    expect(wait).toHaveBeenCalledWith('original-setup', expect.any(AbortSignal))
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
