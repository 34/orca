import type { WorkspaceLineage } from '../../shared/worktree/lineage-types'
import type { ProjectGroup } from '../../shared/project-group-types'
import type { CreateWorktreeResult } from '../../shared/worktree/create-types'
import { randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, realpath, rm, readFile, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { gitExecFileAsync } from '../git/runner'
import { addWorktree } from '../git/worktree'
import type { WorktreeMeta } from '../../shared/worktree/meta-types'
import { mergeWorktreeMetaForWrite } from '../persistence/loading-store/worktree-meta-write-normalization'
import type { Repo } from '../../shared/repo-types'
import type { FolderWorkspace, WorkspaceKey } from '../../shared/folder-workspace-types'
import type { RuntimeManagedWorktreeCreateArgs } from '../runtime/runtime-managed-worktree-create-types'
import { mergeWorktree } from '../ipc/worktree-metadata-merge'
import { MultiRepoWorkspaceStore } from './multi-repo-workspace-store'
import { multiRepoRootFiles } from './multi-repo-workspace-root-files'
import {
  MultiRepoWorkspaceService,
  type MultiRepoCreateRequest
} from './multi-repo-workspace-service'

let root: string
let journal: MultiRepoWorkspaceStore
let service: MultiRepoWorkspaceService
let request: MultiRepoCreateRequest
let groups: ProjectGroup[]
let folders: FolderWorkspace[]
let metadata: Map<string, WorktreeMeta>
let lineages: Record<WorkspaceKey, WorkspaceLineage>
const createFolder = vi.fn<(args: { folderPath?: string | null }) => Promise<FolderWorkspace>>()
const stopRoot = vi.fn<() => Promise<void>>(async () => {})
const waitForSetup = vi.fn(async () => ({ exitCode: 0 }))
const createMemberFixture = async (
  args: RuntimeManagedWorktreeCreateArgs
): Promise<CreateWorktreeResult> => ({
  worktree: mergeWorktree(
    args.repoSelector,
    {
      path: join(root, 'task', args.name),
      head: 'a'.repeat(40),
      branch: 'task/a',
      isBare: false,
      isMainWorktree: false
    },
    undefined
  ),
  setupReceipt: {
    requested: 'skip' as const,
    hookFound: false,
    startupPolicy: 'start-immediately' as const,
    state: 'not_configured' as const
  }
})
const createMember = vi.fn(createMemberFixture)
beforeEach(async () => {
  vi.clearAllMocks()
  groups = [
    {
      id: 'group',
      name: 'Tasks',
      parentPath: null,
      parentGroupId: null,
      createdFrom: 'manual',
      tabOrder: 0,
      isCollapsed: false,
      color: null,
      createdAt: 0,
      updatedAt: 0
    }
  ]
  folders = []
  metadata = new Map()
  lineages = {}
  root = await realpath(await mkdtemp(join(tmpdir(), 'orca-multi-repo-service-')))
  const repos: Repo[] = []
  for (const id of ['api', 'web']) {
    const path = join(root, id)
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
    repos.push({ id, path, displayName: id, badgeColor: '', addedAt: 0 })
  }
  journal = new MultiRepoWorkspaceStore(join(root, 'profile'), 'profile')
  service = new MultiRepoWorkspaceService({
    journal,
    profileId: 'profile',
    getProjectGroupId: async () => 'group',
    stopRootForCleanup: stopRoot,
    store: {
      flushPendingOrThrowAsync: vi.fn(async () => {}),
      getRepo: (id) => repos.find((repo) => repo.id === id),
      getRepos: () => repos,
      getFolderWorkspace: (id) => folders.find((folder) => folder.id === id),
      getAllWorkspaceLineage: () => lineages,
      setWorkspaceLineage: (lineage) => {
        lineages[lineage.childWorkspaceKey] = lineage
        return lineage
      },
      getWorktreeMeta: (id) => metadata.get(id),
      setWorktreeMeta: ({ id, hostId }, patch) => {
        expect(hostId).toBe('local')
        const next = mergeWorktreeMetaForWrite(metadata.get(id), patch)
        metadata.set(id, next)
        return next
      }
    },
    prepareSetupRetry: vi.fn(),
    launchRootAgent: async () => {
      throw new Error('No agent selected in fixture')
    },
    runtime: {
      createFolderWorkspace: createFolder,
      listFolderWorkspaces: () => folders,
      listProjectGroups: () => groups,
      deleteFolderWorkspace: vi.fn(async () => ({ deleted: true })),
      acquireFileWatcherRemoval: vi.fn(async () => ({ finish: async () => {} })),
      createManagedWorktree: createMember,
      removeManagedWorktree: vi.fn(),
      waitForSetupTerminalCompletion: waitForSetup
    }
  })
  createFolder.mockImplementation(async (args) => {
    const folder: FolderWorkspace = {
      id: 'folder',
      projectGroupId: 'group',
      name: 'Task',
      folderPath: args.folderPath ?? '',
      linkedTask: null,
      comment: '',
      isArchived: false,
      isUnread: false,
      isPinned: false,
      sortOrder: 0,
      lastActivityAt: 0,
      createdAt: 0,
      updatedAt: 0
    }
    folders.push(folder)
    return folder
  })
  request = {
    requestId: randomUUID(),
    name: 'Task',
    prompt: 'Update both repositories',
    parentPath: root,
    directoryName: 'task',
    members: repos.map((repo) => ({
      repoId: repo.id,
      directoryName: repo.id,
      baseRef: 'HEAD',
      branchName: 'task/a',
      setupDecision: 'skip'
    }))
  }
})
afterEach(async () => {
  await service.close()
  await rm(root, { recursive: true, force: true })
})

it('deduplicates create/run and links each member to one root without starting child agents', async () => {
  const [first, second] = await Promise.all([service.create(request), service.create(request)])
  expect(first).toEqual(second)
  const [done, duplicate] = await Promise.all([
    service.run(first.taskId),
    service.run(first.taskId)
  ])
  expect(done).toEqual(duplicate)
  expect(createFolder).toHaveBeenCalledTimes(1)
  expect(createMember).toHaveBeenCalledTimes(2)
  for (const [args] of createMember.mock.calls) {
    expect(args.lineage?.parentWorkspace).toBe('folder:folder')
    expect(args.setupOnly).toBe(true)
    expect(args.startupAgent).toBeUndefined()
  }
  expect(done.members.map((member) => member.state)).toEqual(['ready', 'ready'])
  expect(done.agent.state).toBe('pending')
  expect(await readFile(join(root, 'task', 'TASK.md'), 'utf8')).toContain(request.prompt)
  await service.run(first.taskId)
  expect(createMember).toHaveBeenCalledTimes(2)
})

it('retains successful members and does not retry an uncertain Git result', async () => {
  createMember
    .mockImplementationOnce(createMemberFixture)
    .mockRejectedValueOnce(new Error('Git succeeded but metadata failed'))
  const task = await service.create(request)
  const result = await service.run(task.taskId)
  expect(result.members.map((member) => member.state)).toEqual(['ready', 'needs-attention'])
  await service.run(task.taskId)
  expect(createMember).toHaveBeenCalledTimes(2)
})

it('refuses an occupied root without touching its contents', async () => {
  const task = await service.create(request)
  await mkdir(task.plan.rootPath)
  const result = await service.run(task.taskId)
  expect(result.root.state).toBe('needs-attention')
  expect(createFolder).not.toHaveBeenCalled()
  expect(createMember).not.toHaveBeenCalled()
})

it.each(['absent', 'marker', 'complete'] as const)(
  'continues interrupted root initialization at %s',
  async (stage) => {
    const task = await service.create(request)
    task.root.state = 'creating'
    journal.save(task, task.revision)
    if (stage !== 'absent') {
      await mkdir(task.plan.rootPath)
      for (const [name, content] of Object.entries(multiRepoRootFiles(task))) {
        if (stage === 'complete' || name === '.orca-multi-repo.json') {
          await writeFile(join(task.plan.rootPath, name), content)
        }
      }
    }
    const result = await service.run(task.taskId, true)
    expect(result.root.state).toBe('created')
    expect(result.members.every((member) => member.state === 'ready')).toBe(true)
    expect(await readFile(join(task.plan.rootPath, 'TASK.md'), 'utf8')).toBe(
      multiRepoRootFiles(task)['TASK.md']
    )
    expect(createFolder).toHaveBeenCalledTimes(1)
  }
)

it.each(['empty', 'unknown', 'edited'] as const)(
  'preserves unverified root initialization at %s',
  async (stage) => {
    const task = await service.create(request)
    task.root.state = 'creating'
    journal.save(task, task.revision)
    await mkdir(task.plan.rootPath)
    if (stage !== 'empty') {
      await writeFile(
        join(task.plan.rootPath, '.orca-multi-repo.json'),
        multiRepoRootFiles(task)['.orca-multi-repo.json']
      )
      await writeFile(
        join(task.plan.rootPath, stage === 'edited' ? 'TASK.md' : 'notes.txt'),
        'user content'
      )
    }
    const result = await service.run(task.taskId, true)
    expect(result.root.state).toBe('needs-attention')
    expect(createFolder).not.toHaveBeenCalled()
    if (stage !== 'empty') {
      expect(
        await readFile(
          join(task.plan.rootPath, stage === 'edited' ? 'TASK.md' : 'notes.txt'),
          'utf8'
        )
      ).toBe('user content')
    }
  }
)

it('retries a failed member only after proving it created neither a path nor a branch', async () => {
  createMember.mockRejectedValueOnce(new Error('Git could not start'))
  const task = await service.create(request)
  const failed = await service.run(task.taskId)
  expect(failed.members[0].state).toBe('needs-attention')
  const [result, repeated] = await Promise.all([
    service.run(task.taskId, true),
    service.run(task.taskId, true)
  ])
  expect(repeated).toEqual(result)
  expect(result.members.map((member) => member.state)).toEqual(['ready', 'ready'])
  expect(createFolder).toHaveBeenCalledTimes(1)
  expect(createMember).toHaveBeenCalledTimes(3)
})

it.each(['path', 'branch'] as const)(
  'refuses retry when the failed create left a %s',
  async (effect) => {
    createMember.mockRejectedValueOnce(new Error('reply lost'))
    const task = await service.create(request)
    await service.run(task.taskId)
    const member = task.plan.members[0]
    await (effect === 'path'
      ? mkdir(member.worktreePath)
      : gitExecFileAsync(['branch', member.branchName, member.baseCommit], {
          cwd: member.repoPath
        }))
    const result = await service.run(task.taskId, true)
    expect(result.members[0].state).toBe('needs-attention')
    expect(result.members[0].error).toMatch(effect === 'path' ? /lstat.*\.git/ : /already owned/)
    expect(createMember).toHaveBeenCalledTimes(1)
  }
)

it('does not recreate a previously registered member whose directory is missing', async () => {
  const task = await service.create(request)
  const completed = await service.run(task.taskId)
  completed.members[0].state = 'needs-attention'
  completed.members[0].setup = 'pending'
  journal.save(completed, completed.revision)
  const result = await service.run(task.taskId, true)
  expect(result.members[0].state).toBe('needs-attention')
  expect(createMember).toHaveBeenCalledTimes(2)
})

it('requires reconciliation after losing the root registration reply', async () => {
  const task = await service.create(request)
  createFolder.mockRejectedValueOnce(new Error('reply lost'))
  await expect(service.run(task.taskId)).rejects.toThrow('reply lost')
  await expect(service.run(task.taskId)).rejects.toThrow('Recover')
  expect(createFolder).toHaveBeenCalledTimes(1)
})

it('rejects a create reply naming a different instance from the saved intent', async () => {
  const create = createMember.getMockImplementation()
  if (!create) {
    throw new Error('Missing member creator')
  }
  createMember.mockImplementationOnce(async (args) => {
    const result = await create(args)
    return { ...result, worktree: { ...result.worktree, instanceId: randomUUID() } }
  })
  const task = await service.create(request)
  const result = await service.run(task.taskId)
  expect(result.members[0].state).toBe('needs-attention')
  expect(result.members[0].error).toContain('does not match')
  expect(createMember).toHaveBeenCalledTimes(1)
})

it.each([true, false])(
  'recovers existing metadata only with its planned instance (match=%s)',
  async (matches) => {
    const task = await service.create(request)
    createMember.mockImplementationOnce(async () => {
      const current = journal.get(task.taskId)
      if (!current?.members[0].plannedInstanceId) {
        throw new Error('Instance intent was not saved before Git creation')
      }
      const plan = current.plan.members[0]
      await addWorktree(plan.repoPath, plan.worktreePath, plan.branchName, plan.baseCommit)
      metadata.set(
        `${plan.repoId}::${plan.worktreePath}`,
        mergeWorktreeMetaForWrite(undefined, {
          instanceId: matches ? current.members[0].plannedInstanceId : randomUUID(),
          preserveBranchOnDelete: true,
          orcaCreationWorkspaceLayout: { path: current.plan.rootPath, nestWorkspaces: false }
        })
      )
      throw new Error('metadata saved but reply lost')
    })
    await service.run(task.taskId)
    const recovered = await service.run(task.taskId, true)
    expect(recovered.members[0].state).toBe(matches ? 'registered' : 'needs-attention')
    expect(createMember).toHaveBeenCalledTimes(matches ? 2 : 1)
    expect(recovered.agent.state).toBe('pending')
    if (matches) {
      expect(recovered.members[0].instanceId).toBe(recovered.members[0].plannedInstanceId)
      expect(recovered.members[0].setup).toBe('pending')
      expect(Object.values(lineages)[0]).toMatchObject({
        childInstanceId: recovered.members[0].instanceId,
        parentWorkspaceKey: 'folder:folder'
      })
      expect(recovered.members[0].error).toContain('need review')
    }
  }
)

it.each([
  'success',
  'changed-head',
  'changed-branch',
  'marker',
  'no-intent',
  'source-moved'
] as const)(
  'repairs missing metadata only with matching creation evidence (%s)',
  async (outcome) => {
    const task = await service.create(request)
    const plan = task.plan.members[0]
    createMember.mockImplementationOnce(async () => {
      await addWorktree(plan.repoPath, plan.worktreePath, plan.branchName, plan.baseCommit)
      await writeFile(join(plan.worktreePath, 'notes.txt'), 'keep user edits')
      throw new Error('Git succeeded but metadata failed')
    })
    const interrupted = await service.run(task.taskId)
    if (outcome === 'changed-head') {
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
          'user commit'
        ],
        { cwd: plan.worktreePath }
      )
    } else if (outcome === 'changed-branch') {
      await gitExecFileAsync(['checkout', '-b', 'user-branch'], { cwd: plan.worktreePath })
    } else if (outcome === 'marker') {
      await writeFile(join(task.plan.rootPath, '.orca-multi-repo.json'), '{}')
    } else if (outcome === 'no-intent') {
      interrupted.members[0].plannedInstanceId = undefined
      journal.save(interrupted, interrupted.revision)
    } else if (outcome === 'source-moved') {
      await rename(plan.repoPath, `${plan.repoPath}-moved`)
    }
    if (outcome === 'marker') {
      await expect(service.run(task.taskId, true)).rejects.toThrow('marker changed')
    } else {
      const recovered = await service.run(task.taskId, true)
      expect(recovered.members[0].state).toBe(
        outcome === 'success' ? 'registered' : 'needs-attention'
      )
      expect(recovered.agent.state).toBe('pending')
      if (outcome === 'success') {
        const saved = Object.values(lineages)[0]
        const retried = await service.run(task.taskId, true)
        expect(retried.members[0].state).toBe('registered')
        expect(Object.values(lineages)[0]).toBe(saved)
        expect(recovered.members[0].instanceId).toBe(recovered.members[0].plannedInstanceId)
        expect(recovered.members[0].setup).toBe('pending')
        expect(Object.values(lineages)[0]).toMatchObject({
          childInstanceId: recovered.members[0].instanceId,
          parentWorkspaceKey: 'folder:folder'
        })
      }
    }
    expect(createMember).toHaveBeenCalledTimes(outcome === 'success' ? 2 : 1)
    expect(await readFile(join(plan.worktreePath, 'notes.txt'), 'utf8')).toBe('keep user edits')
    const meta = metadata.get(`${plan.repoId}::${plan.worktreePath}`)
    if (outcome === 'success') {
      expect(meta).toMatchObject({
        preserveBranchOnDelete: true,
        baseRef: plan.baseRef,
        hostId: 'local'
      })
    } else {
      expect(meta).toBeUndefined()
    }
  }
)

it('recovers a lost folder reply without creating a second entry', async () => {
  const create = createFolder.getMockImplementation()
  if (!create) {
    throw new Error('Missing folder creator')
  }
  createFolder.mockImplementationOnce(async (args) => {
    await create(args)
    throw new Error('reply lost')
  })
  const task = await service.create(request)
  await expect(service.run(task.taskId)).rejects.toThrow('reply lost')
  const completed = await service.run(task.taskId, true)
  expect(completed.root.folderWorkspaceId).toBe('folder')
  expect(completed.members.every((member) => member.state === 'ready')).toBe(true)
  expect(createFolder).toHaveBeenCalledTimes(1)
})

it.each(['missing', 'ambiguous', 'remote', 'marker'] as const)(
  'refuses root registration recovery with %s evidence',
  async (damage) => {
    const create = createFolder.getMockImplementation()
    if (!create) {
      throw new Error('Missing folder creator')
    }
    createFolder.mockImplementationOnce(async (args) => {
      const folder = await create(args)
      if (damage === 'missing') {
        folders = []
      }
      if (damage === 'ambiguous') {
        folders.push({ ...folder, id: 'other' })
      }
      if (damage === 'remote') {
        folder.connectionId = 'ssh-host'
      }
      throw new Error('reply lost')
    })
    const task = await service.create(request)
    await expect(service.run(task.taskId)).rejects.toThrow('reply lost')
    if (damage === 'marker') {
      await writeFile(join(task.plan.rootPath, '.orca-multi-repo.json'), '{}')
    }
    await expect(service.run(task.taskId, true)).rejects.toThrow(
      /missing or ambiguous|marker changed/
    )
    expect(journal.get(task.taskId)?.root.error).toBeTruthy()
    expect(createFolder).toHaveBeenCalledTimes(1)
    expect(createMember).not.toHaveBeenCalled()
  }
)

it('does not restore a root entry deleted after a successful registration', async () => {
  const task = await service.create(request)
  await service.run(task.taskId)
  folders = []
  await expect(service.run(task.taskId, true)).rejects.toThrow('removed or changed')
  expect(createFolder).toHaveBeenCalledTimes(1)
  expect(createMember).toHaveBeenCalledTimes(2)
})

it('refuses a changed ownership marker even when the root entry still exists', async () => {
  const task = await service.create(request)
  await service.run(task.taskId)
  await writeFile(join(task.plan.rootPath, '.orca-multi-repo.json'), '{}')
  await expect(service.run(task.taskId, true)).rejects.toThrow('marker changed')
  expect(createFolder).toHaveBeenCalledTimes(1)
  expect(createMember).toHaveBeenCalledTimes(2)
})

it('drains the active member before closing and does not start the next member', async () => {
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const original = createMember.getMockImplementation()
  if (!original) {
    throw new Error('Missing test member creator')
  }
  createMember.mockImplementationOnce(async (args) => {
    entered.resolve()
    await release.promise
    return original(args)
  })
  const task = await service.create(request)
  const running = service.run(task.taskId)
  await entered.promise
  let closed = false
  const closing = service.close().then(() => {
    closed = true
  })
  await expect(service.run(task.taskId)).rejects.toThrow('closing')
  expect(closed).toBe(false)
  release.resolve()
  const result = await running
  await closing
  expect(result.members.map((member) => member.state)).toEqual(['ready', 'planned'])
  expect(createMember).toHaveBeenCalledTimes(1)
  expect(() => journal.get(task.taskId)).toThrow('closed')
})

it.each(['success', 'reply-lost', 'failure', 'replaced', 'moved', 'source-changed'] as const)(
  'validates the initial setup completion (%s)',
  async (outcome) => {
    const original = createMember.getMockImplementation()
    if (!original) {
      throw new Error('Missing member fixture')
    }
    request.members[0].setupDecision = 'run'
    const task = await service.create(request)
    const plan = task.plan.members[0]
    createMember.mockImplementationOnce(async (args) => {
      const instanceId = journal.get(task.taskId)?.members[0].plannedInstanceId
      if (!instanceId) {
        throw new Error('Missing instance intent')
      }
      await addWorktree(plan.repoPath, plan.worktreePath, plan.branchName, plan.baseCommit)
      const result = await original(args)
      metadata.set(
        result.worktree.id,
        mergeWorktreeMetaForWrite(undefined, {
          instanceId,
          preserveBranchOnDelete: true,
          orcaCreationWorkspaceLayout: { path: task.plan.rootPath, nestWorkspaces: false }
        })
      )
      args.onFilesPrepared?.({ ...result.worktree, instanceId }, 'include warning')
      if (outcome === 'reply-lost') {
        throw new Error('setup launch reply lost')
      }
      return {
        ...result,
        worktree: { ...result.worktree, instanceId },
        setupReceipt: {
          requested: 'run',
          hookFound: true,
          startupPolicy: 'wait-for-setup',
          state: 'running',
          terminalHandle: `term_${args.setupCompletionToken}`
        }
      }
    })
    waitForSetup.mockImplementationOnce(async () => {
      expect(journal.get(task.taskId)?.members[0].preparation).toEqual({
        state: 'finished',
        warning: 'include warning'
      })
      if (outcome === 'replaced') {
        metadata.clear()
      } else if (outcome === 'moved') {
        await gitExecFileAsync(
          ['worktree', 'move', plan.worktreePath, `${plan.worktreePath}-moved`],
          {
            cwd: plan.repoPath
          }
        )
      } else if (outcome === 'source-changed') {
        await rename(plan.repoPath, `${plan.repoPath}-moved`)
      }
      return { exitCode: outcome === 'failure' ? 1 : 0 }
    })
    const initial = await service.run(task.taskId)
    const completed = outcome === 'reply-lost' ? await service.run(task.taskId, true) : initial
    expect(waitForSetup).toHaveBeenCalledWith(
      `term_${completed.members[0].setupCompletionToken}`,
      expect.any(AbortSignal),
      completed.members[0].setupCompletionToken
    )
    expect(completed.members[0].setupExitCode).toBe(
      outcome === 'success' || outcome === 'reply-lost' ? 0 : outcome === 'failure' ? 1 : undefined
    )
    expect(completed.members[0].setup).toBe(
      outcome === 'success' || outcome === 'reply-lost' ? 'succeeded' : 'failed'
    )
    expect(completed.members[0].state).toBe(
      outcome === 'success' || outcome === 'reply-lost' ? 'ready' : 'registered'
    )
    expect(createMember).toHaveBeenCalledTimes(2)
    expect(completed.agent.state).toBe('pending')
  }
)

it.each(['success', 'failure', 'stale', 'replaced', 'changed-during-wait'] as const)(
  'observes the original setup after an interrupted wait (%s)',
  async (outcome) => {
    const create = createMember.getMockImplementation()
    if (!create) {
      throw new Error('Missing member creator')
    }
    request.members[0].setupDecision = 'run'
    const task = await service.create(request)
    createMember.mockImplementationOnce(async (args) => {
      const current = journal.get(task.taskId)
      const instanceId = current?.members[0].plannedInstanceId
      if (!instanceId) {
        throw new Error('Missing instance intent')
      }
      const plan = task.plan.members[0]
      await addWorktree(plan.repoPath, plan.worktreePath, plan.branchName, plan.baseCommit)
      const result = await create(args)
      metadata.set(
        result.worktree.id,
        mergeWorktreeMetaForWrite(undefined, {
          instanceId,
          preserveBranchOnDelete: true,
          orcaCreationWorkspaceLayout: { path: task.plan.rootPath, nestWorkspaces: false }
        })
      )
      return {
        ...result,
        worktree: { ...result.worktree, instanceId },
        setupReceipt: {
          requested: 'run',
          hookFound: true,
          startupPolicy: 'wait-for-setup',
          state: 'running',
          terminalHandle: `term_${args.setupCompletionToken}`
        }
      }
    })
    waitForSetup.mockRejectedValueOnce(new Error('observation interrupted'))
    const interrupted = await service.run(task.taskId)
    expect(interrupted.members[0].setup).toBe('failed')
    if (outcome === 'replaced') {
      metadata.clear()
    }
    if (outcome === 'stale') {
      waitForSetup.mockRejectedValueOnce(new Error('terminal_handle_stale'))
    } else if (outcome === 'changed-during-wait') {
      waitForSetup.mockImplementationOnce(async () => {
        metadata.clear()
        return { exitCode: 0 }
      })
    } else if (outcome !== 'replaced') {
      waitForSetup.mockResolvedValueOnce({ exitCode: outcome === 'success' ? 0 : 1 })
    }
    const recovered = await service.run(task.taskId, true)
    expect(createMember).toHaveBeenCalledTimes(2)
    expect(waitForSetup).toHaveBeenCalledTimes(outcome === 'replaced' ? 1 : 2)
    expect(recovered.members[0].state).toBe(
      outcome === 'success' ? 'ready' : outcome === 'replaced' ? 'needs-attention' : 'registered'
    )
    expect(recovered.members[0].setup).toBe(outcome === 'success' ? 'succeeded' : 'failed')
  }
)

it('requires a current root entry before requesting strict cleanup stop', async () => {
  const task = await service.create(request)
  await service.run(task.taskId)
  await service.stopRootForCleanup(task.taskId)
  expect(stopRoot).toHaveBeenCalledOnce()
  folders = []
  await expect(service.stopRootForCleanup(task.taskId)).rejects.toThrow('removed or changed')
  expect(stopRoot).toHaveBeenCalledOnce()
})
it('propagates unverified root stop without removing or recreating members', async () => {
  const task = await service.create(request)
  const before = await service.run(task.taskId)
  stopRoot.mockRejectedValueOnce(new Error('unverifiable'))
  await expect(service.stopRootForCleanup(task.taskId)).rejects.toThrow('unverifiable')
  expect(journal.get(task.taskId)?.members).toEqual(before.members)
  expect(createMember).toHaveBeenCalledTimes(2)
})

it('restores a deleted root entry explicitly without creating members or launching agents', async () => {
  const initial = await service.create(request)
  const completed = await service.run(initial.taskId)
  folders = []
  const restored = await service.restoreRoot(initial.taskId, completed.revision)
  expect(restored.root.folderWorkspaceId).toBe('folder')
  expect(restored.root.error).toBeUndefined()
  expect(createFolder).toHaveBeenCalledTimes(2)
  expect(createMember).toHaveBeenCalledTimes(2)
  expect(restored.members).toEqual(completed.members)
  expect(restored.agent).toEqual(completed.agent)
  await service.restoreRoot(initial.taskId, restored.revision)
  expect(createFolder).toHaveBeenCalledTimes(2)
})

it('adopts the unique restored entry after its creation reply was lost', async () => {
  const initial = await service.create(request)
  const completed = await service.run(initial.taskId)
  folders = []
  const create = createFolder.getMockImplementation()!
  createFolder.mockImplementationOnce(async (args) => {
    const result = await create(args)
    result.id = 'restored-folder'
    throw new Error('restoration reply lost')
  })
  await expect(service.restoreRoot(initial.taskId, completed.revision)).rejects.toThrow(
    'reply lost'
  )
  const interrupted = journal.get(initial.taskId)!
  expect(interrupted.root.folderRegistration).toBe('creating')
  const restored = await service.restoreRoot(initial.taskId, interrupted.revision)
  expect(restored.root.folderWorkspaceId).toBe('restored-folder')
  expect(createFolder).toHaveBeenCalledTimes(2)
  expect(createMember).toHaveBeenCalledTimes(2)
})

it.each([
  'marker',
  'ambiguous',
  'other-group',
  'changed-entry',
  'remote-group',
  'missing-group',
  'removed'
] as const)('refuses explicit root restoration with %s evidence', async (damage) => {
  const initial = await service.create(request)
  const completed = await service.run(initial.taskId)
  const original = folders[0]
  folders = []
  if (damage === 'marker') {
    await writeFile(join(initial.plan.rootPath, '.orca-multi-repo.json'), '{}')
  } else if (damage === 'ambiguous') {
    folders = [
      { ...original, id: 'a' },
      { ...original, id: 'b' }
    ]
  } else if (damage === 'other-group') {
    folders = [{ ...original, id: 'a', projectGroupId: 'another' }]
  } else if (damage === 'changed-entry') {
    folders = [{ ...original, folderPath: root }]
  } else if (damage === 'remote-group') {
    groups[0].connectionId = 'ssh-other'
  } else if (damage === 'missing-group') {
    groups = []
  } else {
    completed.root.state = 'removed'
    journal.save(completed, completed.revision)
  }
  await expect(
    service.restoreRoot(initial.taskId, journal.get(initial.taskId)!.revision)
  ).rejects.toThrow()
  expect(createFolder).toHaveBeenCalledTimes(1)
  expect(createMember).toHaveBeenCalledTimes(2)
})

it('does not save or run a new task when its confirmed plan differs from preflight', async () => {
  const planned = await service.create(request)
  const requestId = randomUUID()
  const confirmedPlan = structuredClone(planned.plan)
  confirmedPlan.members[0].baseCommit = '0'.repeat(40)
  await expect(service.create({ ...request, requestId, confirmedPlan })).rejects.toThrow(
    'plan changed'
  )
  expect(journal.get(requestId)).toBeUndefined()
  expect(createFolder).not.toHaveBeenCalled()
  expect(createMember).not.toHaveBeenCalled()
  const accepted = await service.create({ ...request, requestId, confirmedPlan: planned.plan })
  expect(accepted.plan).toEqual(planned.plan)
})
