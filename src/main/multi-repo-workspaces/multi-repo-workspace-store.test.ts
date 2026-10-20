import { recordMultiRepoPreparation } from './multi-repo-workspace-preparation-receipt'
import { mergeWorktree } from '../ipc/worktree-metadata-merge'
import { startMultiRepoRootAgent } from './multi-repo-workspace-agent'
import type { AgentLaunchResult } from '../../shared/agent-launch-intent'
import { randomUUID } from 'node:crypto'
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  realpathSync,
  symlinkSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  multiRepoContextSchema,
  type MultiRepoTask
} from '../../shared/multi-repo-workspaces/multi-repo-workspace-contract'
import * as durableWrite from '../durable-file-write'
import type { Repo } from '../../shared/repo-types'
import { gitExecFileAsync } from '../git/runner'
import {
  bindMultiRepoWorkspaceOwner,
  resolveMultiRepoPlacement
} from './multi-repo-workspace-placement'
import { MultiRepoWorkspaceStore } from './multi-repo-workspace-store'

let profilePath: string
let store: MultiRepoWorkspaceStore
let task: MultiRepoTask
function recordPath(): string {
  return join(profilePath, 'multi-repo-workspaces', 'tasks', `${task.taskId}.json`)
}
beforeEach(() => {
  profilePath = realpathSync(mkdtempSync(join(tmpdir(), 'orca-multi-repo-store-')))
  store = new MultiRepoWorkspaceStore(profilePath, 'profile-a')
  const taskId = randomUUID()
  const rootPath = join(profilePath, 'tasks', taskId)
  task = {
    schemaVersion: 1,
    taskId,
    requestId: taskId,
    revision: 0,
    profileId: 'profile-a',
    hostId: 'local',
    name: '需求 A',
    prompt: 'Update API and web',
    plan: {
      parentPath: join(profilePath, 'tasks'),
      rootPath,
      members: [
        {
          repoId: 'api',
          directoryName: 'api',
          baseRef: 'main',
          branchName: 'task/a',
          setupDecision: 'skip',
          repoPath: join(profilePath, 'source'),
          commonDir: join(profilePath, 'source', '.git'),
          baseCommit: 'a'.repeat(40),
          worktreePath: join(rootPath, 'api')
        }
      ]
    },
    root: { state: 'planned' },
    members: [{ repoId: 'api', state: 'planned', setup: 'pending' }],
    agent: { state: 'pending' }
  }
})
afterEach(() => {
  vi.restoreAllMocks()
  rmSync(profilePath, { recursive: true, force: true })
})

it('persists intent and resumes the same task after reopening the profile', () => {
  expect(store.list()).toEqual([])
  const saved = store.save(task, null)
  store.close()
  const reopened = new MultiRepoWorkspaceStore(profilePath, 'profile-a')
  expect(reopened.get(task.requestId)).toEqual(saved)
  const updated = reopened.save({ ...saved, root: { state: 'creating' } }, saved.revision)
  expect(updated.revision).toBe(1)
  expect(reopened.list()).toEqual([updated])
})

it('rejects duplicate creation and stale results without losing newer state', () => {
  const original = store.save(task, null)
  expect(() => store.save(task, null)).toThrow('revision conflict')
  const updated = store.save(
    { ...original, root: { state: 'created', folderWorkspaceId: 'root' } },
    0
  )
  expect(() => store.save(original, 0)).toThrow('revision conflict')
  expect(store.get(task.taskId)).toEqual(updated)
})

it('fences old profile operations after close and rejects another profile identity', () => {
  store.save(task, null)
  store.close()
  expect(() => store.save(task, 0)).toThrow('closed')
  expect(() => store.list()).toThrow('closed')
  const another = new MultiRepoWorkspaceStore(profilePath, 'profile-b')
  expect(() => another.get(task.taskId)).toThrow('identity')
  expect(() => another.save(task, 0)).toThrow('identity')
})

it('rejects path traversal and mismatched request identity', () => {
  expect(() => store.get('../outside')).toThrow()
  expect(() => store.save({ ...task, requestId: randomUUID() }, null)).toThrow('identity')
  expect(store.list()).toEqual([])
})

it('cannot rewrite the recorded plan during retry or change member identity', () => {
  const saved = store.save(task, null)
  const changed = structuredClone(saved)
  changed.plan.members[0].branchName = 'different'
  expect(() => store.save(changed, 0)).toThrow('cannot change')
  changed.plan = saved.plan
  changed.members[0].repoId = 'web'
  expect(() => store.save(changed, 0)).toThrow('does not match')
  expect(store.get(task.taskId)).toEqual(saved)
})

it.each(['{broken', JSON.stringify({ schemaVersion: 2, futureData: 'must survive' })])(
  'refuses damaged or newer records without replacing their bytes',
  (contents) => {
    store.save(task, null)
    writeFileSync(recordPath(), contents)
    expect(() => store.get(task.taskId)).toThrow()
    expect(() => store.save(task, 0)).toThrow()
    expect(readFileSync(recordPath(), 'utf8')).toBe(contents)
  }
)

it('validates member correspondence on reads as well as writes', () => {
  store.save(task, null)
  writeFileSync(recordPath(), JSON.stringify({ ...task, members: [] }))
  expect(() => store.get(task.taskId)).toThrow()
})

it('keeps the previous record when persistence fails and ignores abandoned temp files', () => {
  store.save(task, null)
  const before = readFileSync(recordPath(), 'utf8')
  const persist = vi.spyOn(durableWrite, 'writeFileDurableSync').mockImplementationOnce(() => {
    throw new Error('disk full')
  })
  expect(() => store.save({ ...task, root: { state: 'creating' } }, 0)).toThrow('disk full')
  expect(readFileSync(recordPath(), 'utf8')).toBe(before)
  persist.mockRestore()
  writeFileSync(`${recordPath()}.abandoned.tmp`, '{partial')
  expect(store.list()).toEqual([task])
  expect(readdirSync(join(profilePath, 'multi-repo-workspaces', 'tasks'))).toHaveLength(2)
})

async function preparePlacement() {
  const member = task.plan.members[0]
  mkdirSync(member.repoPath)
  await gitExecFileAsync(['init', '--quiet'], { cwd: member.repoPath })
  task.root.state = 'created'
  task.members[0].state = 'creating'
  mkdirSync(task.plan.rootPath, { recursive: true })
  store.save(task, null)
  const runtimeStore = {}
  const unbind = bindMultiRepoWorkspaceOwner(runtimeStore, store)
  const repo: Repo = {
    id: 'api',
    path: member.repoPath,
    displayName: 'API',
    badgeColor: '',
    addedAt: 0
  }
  const placement = { taskId: task.taskId, repoId: 'api' }
  return { runtimeStore, repo, placement, unbind }
}

it('resolves only an owned persisted member and fences a closed owner', async () => {
  const { runtimeStore, repo, placement, unbind } = await preparePlacement()
  await expect(resolveMultiRepoPlacement(runtimeStore, repo, placement)).resolves.toMatchObject(
    task.plan.members[0]
  )
  expect(() => bindMultiRepoWorkspaceOwner(runtimeStore, store)).toThrow('already has')
  await expect(
    resolveMultiRepoPlacement(runtimeStore, { ...repo, connectionId: 'remote' }, placement)
  ).rejects.toThrow('native-local')
  unbind()
  await expect(resolveMultiRepoPlacement(runtimeStore, repo, placement)).rejects.toThrow('owner')
})

it('requires recovery instead of adding over an existing member directory', async () => {
  const { runtimeStore, repo, placement, unbind } = await preparePlacement()
  mkdirSync(task.plan.members[0].worktreePath)
  await expect(resolveMultiRepoPlacement(runtimeStore, repo, placement)).rejects.toThrow(
    'already exists'
  )
  unbind()
})

it('rejects a root replaced with a symbolic link', async () => {
  if (process.platform === 'win32') {
    return
  }
  const { runtimeStore, repo, placement, unbind } = await preparePlacement()
  rmSync(task.plan.rootPath, { recursive: true })
  const replacement = join(profilePath, 'replacement')
  mkdirSync(replacement)
  symlinkSync(replacement, task.plan.rootPath)
  await expect(resolveMultiRepoPlacement(runtimeStore, repo, placement)).rejects.toThrow('replaced')
  unbind()
})

const launchResult: AgentLaunchResult = {
  worktreeId: 'folder:root',
  outcome: { kind: 'terminal', handle: 'term-1' },
  receipt: {
    mode: 'terminal',
    preferred: 'terminal',
    reason: 'user_default',
    detail: 'Terminal selected'
  }
}
it('records root launch intent before effects and never launches a completed task twice', async () => {
  task.agent.selected = 'codex'
  task.root = { state: 'created', folderWorkspaceId: 'root' }
  task.members[0].state = 'ready'
  task.members[0].setup = 'skipped'
  task = store.save(task, null)
  const launch = vi.fn(async (intent: MultiRepoTask, replay: boolean) => {
    expect(replay).toBe(false)
    expect(store.get(task.taskId)?.agent.operationId).toBe(intent.agent.operationId)
    expect(store.get(task.taskId)?.agent.state).toBe('starting')
    return launchResult
  })
  const started = await startMultiRepoRootAgent({ task, journal: store, launch })
  expect(started.agent.state).toBe('started')
  expect(started.agent.result).toEqual(launchResult)
  await startMultiRepoRootAgent({ task: started, journal: store, launch })
  expect(launch).toHaveBeenCalledOnce()
})
it('uses the same operation for a lost root launch reply and refuses to launch before setup', async () => {
  task.agent.selected = 'codex'
  task.root = { state: 'created', folderWorkspaceId: 'root' }
  task = store.save(task, null)
  const launch = vi.fn(async () => launchResult)
  await startMultiRepoRootAgent({ task, journal: store, launch })
  expect(launch).not.toHaveBeenCalled()
  task.members[0].state = 'ready'
  task.members[0].setup = 'skipped'
  task = store.save(task, task.revision)
  launch.mockRejectedValueOnce(new Error('reply lost'))
  const failed = await startMultiRepoRootAgent({ task, journal: store, launch })
  expect(failed.agent.state).toBe('failed')
  const operationId = failed.agent.operationId
  const recovered = await startMultiRepoRootAgent({ task: failed, journal: store, launch })
  expect(recovered.agent.operationId).toBe(operationId)
  expect(launch.mock.calls[1]).toEqual([
    expect.objectContaining({ agent: expect.objectContaining({ operationId }) }),
    true
  ])
})

it('pins resolved plugin arguments before dispatch and reuses them after a lost reply', async () => {
  task.agent.selected = 'codex'
  task.root = { state: 'created', folderWorkspaceId: 'root' }
  task.members[0].state = 'ready'
  task.members[0].setup = 'skipped'
  task = store.save(task, null)
  const originalArgs = '-c \'plugins."proof@local".enabled=true\''
  const resolveArguments = vi.fn(async () => originalArgs)
  const launch = vi.fn(async (intent: MultiRepoTask) => {
    expect(store.get(task.taskId)?.agent.launchArgs).toBe(originalArgs)
    expect(intent.agent.launchArgs).toBe(originalArgs)
    return launchResult
  })
  launch.mockRejectedValueOnce(new Error('reply lost'))
  const failed = await startMultiRepoRootAgent({ task, journal: store, resolveArguments, launch })
  store.close()
  store = new MultiRepoWorkspaceStore(profilePath, 'profile-a')
  const persisted = store.get(failed.taskId)
  if (!persisted) {
    throw new Error('Task was not persisted')
  }
  resolveArguments.mockResolvedValue('--model changed')
  const recovered = await startMultiRepoRootAgent({
    task: persisted,
    journal: store,
    resolveArguments,
    launch
  })
  expect(recovered.agent.state).toBe('started')
  expect(recovered.agent.operationId).toBe(failed.agent.operationId)
  expect(resolveArguments).toHaveBeenCalledOnce()
})

it.each([undefined, '', '--model auto --plugin-dir "/workspace/local plugin"'])(
  'retains root argument override %j across persisted launch retries',
  async (agentArgs) => {
    task.context = multiRepoContextSchema.parse({ agentArgs })
    task.agent.selected = 'cursor'
    task.root = { state: 'created', folderWorkspaceId: 'root' }
    task.members[0].state = 'ready'
    task.members[0].setup = 'skipped'
    task = store.save(task, null)
    const launch = vi.fn(async (intent: MultiRepoTask) => {
      expect(intent.context?.agentArgs).toBe(agentArgs)
      return launchResult
    })
    launch.mockRejectedValueOnce(new Error('reply lost'))
    const failed = await startMultiRepoRootAgent({ task, journal: store, launch })
    store.close()
    store = new MultiRepoWorkspaceStore(profilePath, 'profile-a')
    const persisted = store.get(failed.taskId)
    expect(persisted?.context?.agentArgs).toBe(agentArgs)
    if (!persisted) {
      throw new Error('Task was not persisted')
    }
    const recovered = await startMultiRepoRootAgent({ task: persisted, journal: store, launch })
    expect(recovered.agent.state).toBe('started')
    expect(recovered.agent.operationId).toBe(failed.agent.operationId)
  }
)

it.each(['valid', 'instance', 'path', 'host', 'runtime', 'stage', 'revision'] as const)(
  'persists a file preparation receipt only for its current intent (%s)',
  (caseName) => {
    task.root.state = 'created'
    task.members[0].state = 'creating'
    const instanceId = randomUUID()
    task.members[0].plannedInstanceId = instanceId
    task = store.save(task, null)
    const plan = task.plan.members[0]
    const worktree = {
      ...mergeWorktree(
        plan.repoId,
        {
          path: plan.worktreePath,
          head: plan.baseCommit,
          branch: plan.branchName,
          isBare: false,
          isMainWorktree: false
        },
        undefined
      ),
      instanceId
    }
    if (caseName === 'instance') {
      worktree.instanceId = randomUUID()
    }
    if (caseName === 'path') {
      worktree.path += '-other'
    }
    if (caseName === 'host') {
      worktree.hostId = 'ssh:remote'
    }
    if (caseName === 'runtime') {
      worktree.runtimeOwnerEnvironmentId = 'remote'
    }
    if (caseName === 'stage') {
      task.members[0].state = 'ready'
    }
    if (caseName === 'revision') {
      store.save(task, task.revision)
    }
    if (caseName !== 'valid') {
      expect(() => recordMultiRepoPreparation(task, store, worktree)).toThrow()
      expect(store.get(task.taskId)?.members[0].preparation).toBeUndefined()
      return
    }
    expect(() => recordMultiRepoPreparation(task, store, worktree, undefined, true)).toThrow()
    const saved = recordMultiRepoPreparation(task, store, worktree, 'review skipped includes')
    expect(saved.members[0].setup).toBe('pending')
    expect(saved.members[0].state).toBe('creating')
    const reopened = new MultiRepoWorkspaceStore(profilePath, 'profile-a')
    expect(reopened.get(task.taskId)?.members[0].preparation).toEqual({
      state: 'finished',
      warning: 'review skipped includes'
    })
    const skipped = recordMultiRepoPreparation(saved, store, worktree, 'policy warning', true)
    expect(reopened.get(task.taskId)?.members[0].setupNotStarted).toBe(true)
    expect(skipped.members[0].preparation?.warning).toBe('policy warning')
  }
)
