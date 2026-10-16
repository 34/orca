import { removeMultiRepoMember } from './multi-repo-workspace-removal'
import type { RemoveManagedWorktreeOptions } from '../runtime/runtime-worktree-selection'
import { bindMultiRepoWorkspaceOwner } from './multi-repo-workspace-placement'
import { MultiRepoWorkspaceStore } from './multi-repo-workspace-store'
import { randomUUID } from 'node:crypto'
import { mkdtemp, realpath, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { MultiRepoTask } from '../../shared/multi-repo-workspaces/multi-repo-workspace-contract'
import type { Repo } from '../../shared/repo-types'
import { gitExecFileAsync } from '../git/runner'
import { addWorktree, removeWorktree } from '../git/worktree'
import { mergeWorktreeMetaForWrite } from '../persistence/loading-store/worktree-meta-write-normalization'
import { planMultiRepoWorkspace } from './multi-repo-workspace-plan'
import { multiRepoRootFiles } from './multi-repo-workspace-root-files'
import { previewMultiRepoRemoval } from './multi-repo-workspace-removal-preview'

let unbind: () => void
let journal: MultiRepoWorkspaceStore
let root: string
let task: MultiRepoTask
let repo: Repo
let instanceId: string
const store = {
  getRepo: () => repo,
  getWorktreeMeta: () =>
    mergeWorktreeMetaForWrite(undefined, {
      instanceId,
      preserveBranchOnDelete: true,
      orcaCreationWorkspaceLayout: { path: task.plan.rootPath, nestWorkspaces: false }
    })
}
beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'orca-removal-preview-')))
  journal = new MultiRepoWorkspaceStore(join(root, 'profile'), 'profile')
  unbind = bindMultiRepoWorkspaceOwner(store, journal)
  const path = join(root, 'source')
  await mkdir(path)
  await gitExecFileAsync(['init', '--quiet'], { cwd: path })
  await writeFile(join(path, '.gitignore'), 'ignored.txt\n')
  await gitExecFileAsync(['add', '.'], { cwd: path })
  await gitExecFileAsync(
    [
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      '-c',
      'commit.gpgSign=false',
      'commit',
      '-qm',
      'initial'
    ],
    { cwd: path }
  )
  repo = { id: 'api', path, displayName: 'API', badgeColor: '', addedAt: 0 }
  const plan = await planMultiRepoWorkspace({
    parentPath: root,
    directoryName: 'task',
    members: [
      {
        repoId: repo.id,
        directoryName: 'api',
        baseRef: 'HEAD',
        branchName: 'task/test',
        setupDecision: 'skip'
      }
    ],
    store
  })
  await mkdir(plan.rootPath)
  await addWorktree(path, plan.members[0].worktreePath, 'task/test', plan.members[0].baseCommit)
  instanceId = randomUUID()
  const taskId = randomUUID()
  task = {
    schemaVersion: 1,
    taskId,
    requestId: taskId,
    revision: 1,
    profileId: 'profile',
    hostId: 'local',
    name: 'Test',
    prompt: '',
    plan,
    root: { state: 'created' },
    members: [
      {
        repoId: repo.id,
        worktreeId: `${repo.id}::${plan.members[0].worktreePath}`,
        instanceId,
        state: 'ready',
        setup: 'skipped'
      }
    ],
    agent: { state: 'pending' }
  }
  for (const [name, contents] of Object.entries(multiRepoRootFiles(task))) {
    await writeFile(join(plan.rootPath, name), contents)
  }
})
afterEach(async () => {
  unbind()
  await rm(root, { recursive: true, force: true })
})

it('previews dirty, untracked, ignored and root notes without changing data', async () => {
  const member = task.plan.members[0].worktreePath
  await writeFile(join(member, '.gitignore'), 'ignored.txt\nother.txt\n')
  await writeFile(join(member, 'untracked.txt'), 'keep')
  await writeFile(join(member, 'ignored.txt'), 'keep ignored')
  await writeFile(join(task.plan.rootPath, 'notes.md'), 'keep notes')
  await writeFile(join(task.plan.rootPath, 'TASK.md'), 'edited task')
  const snapshot = JSON.stringify(task)
  const preview = await previewMultiRepoRemoval(task, store)
  expect(preview.members[0].error).toBeUndefined()
  expect(preview.members[0].changedPaths).toEqual(
    expect.arrayContaining(['.gitignore', 'untracked.txt'])
  )
  expect(preview.members[0].ignoredPaths).toContain('ignored.txt')
  expect(preview.removableRootFiles).toEqual(['.orca-multi-repo.json'])
  expect(preview.retainedRootEntries).toEqual(['TASK.md', 'notes.md'])
  expect(JSON.stringify(task)).toBe(snapshot)
  expect(await readFile(join(member, 'ignored.txt'), 'utf8')).toBe('keep ignored')
})
it('blocks a replaced metadata instance', async () => {
  instanceId = randomUUID()
  expect((await previewMultiRepoRemoval(task, store)).members[0].error).toContain('creation intent')
})
it('does not treat a generated file symlink as removable', async () => {
  const path = join(task.plan.rootPath, 'TASK.md')
  await rm(path)
  await symlink(join(repo.path, '.gitignore'), path)
  expect((await previewMultiRepoRemoval(task, store)).retainedRootEntries).toContain('TASK.md')
})
it('blocks Git identity changes', async () => {
  await gitExecFileAsync(['checkout', '--detach'], { cwd: task.plan.members[0].worktreePath })
  expect((await previewMultiRepoRemoval(task, store)).members[0].error).toContain(
    'Git identity changed'
  )
})

function deletion(stopRoot = vi.fn(async () => {})) {
  task = journal.save({ ...task, revision: 0 }, null)
  const remove = vi.fn(async (_id: string, options?: RemoveManagedWorktreeOptions) => {
    await options?.beforeDelete?.()
    await removeWorktree(repo.path, task.plan.members[0].worktreePath, false, {
      deleteBranch: false
    })
    return {}
  })
  return {
    run: () =>
      removeMultiRepoMember({
        taskId: task.taskId,
        revision: task.revision,
        repoId: repo.id,
        journal,
        store,
        runtime: { removeManagedWorktree: remove, listFolderWorkspaces: () => [] },
        stopRootForCleanup: stopRoot
      }),
    remove,
    stopRoot
  }
}
it('removes a clean member only after the root stop and preserves its branch', async () => {
  const operation = deletion()
  expect((await operation.run()).members[0].state).toBe('removed')
  expect(operation.stopRoot).toHaveBeenCalledOnce()
  expect(operation.remove).toHaveBeenCalledWith(
    `id:${task.members[0].worktreeId}`,
    expect.objectContaining({ force: false, runHooks: true, waitForBackgroundRemoval: true })
  )
  await expect(
    readFile(join(task.plan.members[0].worktreePath, '.git'), 'utf8')
  ).rejects.toMatchObject({ code: 'ENOENT' })
  expect(
    (await gitExecFileAsync(['show-ref', '--verify', 'refs/heads/task/test'], { cwd: repo.path }))
      .stdout
  ).toContain('refs/heads/task/test')
})
it('refuses ignored data before stopping any session', async () => {
  await writeFile(join(task.plan.members[0].worktreePath, 'ignored.txt'), 'keep')
  const operation = deletion()
  await expect(operation.run()).rejects.toThrow('ignored files')
  expect(operation.remove).not.toHaveBeenCalled()
  expect(operation.stopRoot).not.toHaveBeenCalled()
})
it('rechecks ignored data created during root stop and retains the member', async () => {
  const operation = deletion(
    vi.fn(async () => {
      await writeFile(join(task.plan.members[0].worktreePath, 'ignored.txt'), 'new data')
    })
  )
  const result = await operation.run()
  expect(result.members[0].state).toBe('needs-attention')
  expect(result.members[0].error).toContain('ignored files')
  expect(await readFile(join(task.plan.members[0].worktreePath, 'ignored.txt'), 'utf8')).toBe(
    'new data'
  )
})
it('retains a member when root exit cannot be verified', async () => {
  const operation = deletion(
    vi.fn(async () => {
      throw new Error('unverifiable')
    })
  )
  const result = await operation.run()
  expect(result.members[0].state).toBe('needs-attention')
  expect(result.members[0].error).toContain('unverifiable')
  expect(await readFile(join(task.plan.members[0].worktreePath, '.git'), 'utf8')).toContain(
    'gitdir:'
  )
})
