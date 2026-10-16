import { randomUUID } from 'node:crypto'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { FolderWorkspace } from '../../shared/folder-workspace-types'
import { MultiRepoWorkspaceService } from './multi-repo-workspace-service'
import { MultiRepoWorkspaceStore } from './multi-repo-workspace-store'

let root: string
let journal: MultiRepoWorkspaceStore
let service: MultiRepoWorkspaceService
let taskId: string
let folders: FolderWorkspace[]
const flushProfile = vi.fn(async () => {})
const createMember = vi.fn(async () => {
  throw new Error('Stop after checking root durability')
})

beforeEach(async () => {
  vi.clearAllMocks()
  flushProfile.mockReset()
  flushProfile.mockResolvedValue(undefined)
  folders = []
  root = await realpath(await mkdtemp(join(tmpdir(), 'orca-root-durability-')))
  taskId = randomUUID()
  journal = new MultiRepoWorkspaceStore(join(root, 'profile'), 'profile')
  journal.save(
    {
      schemaVersion: 1,
      taskId,
      requestId: taskId,
      revision: 0,
      profileId: 'profile',
      hostId: 'local',
      name: 'Task',
      prompt: 'Test durability',
      plan: {
        parentPath: root,
        rootPath: join(root, 'task'),
        members: [
          {
            repoId: 'api',
            directoryName: 'api',
            baseRef: 'HEAD',
            branchName: 'task/a',
            setupDecision: 'skip',
            repoPath: join(root, 'source'),
            commonDir: join(root, 'source', '.git'),
            baseCommit: 'a'.repeat(40),
            worktreePath: join(root, 'task', 'api')
          }
        ]
      },
      root: { state: 'planned' },
      members: [{ repoId: 'api', state: 'planned', setup: 'pending' }],
      agent: { state: 'pending' }
    },
    null
  )
  service = new MultiRepoWorkspaceService({
    journal,
    profileId: 'profile',
    getProjectGroupId: async () => 'group',
    store: {
      flushPendingOrThrowAsync: flushProfile,
      getRepo: vi.fn(),
      getFolderWorkspace: vi.fn(),
      getAllWorkspaceLineage: () => ({}),
      setWorkspaceLineage: vi.fn(),
      getWorktreeMeta: vi.fn(),
      setWorktreeMeta: vi.fn()
    },
    prepareSetupRetry: vi.fn(),
    stopRootForCleanup: vi.fn(),
    launchRootAgent: vi.fn(),
    runtime: {
      createFolderWorkspace: async () => {
        const folder: FolderWorkspace = {
          id: 'folder',
          projectGroupId: 'group',
          name: 'Task',
          folderPath: join(root, 'task'),
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
      },
      listFolderWorkspaces: () => folders,
      listProjectGroups: () => [],
      deleteFolderWorkspace: vi.fn(),
      acquireFileWatcherRemoval: vi.fn(),
      createManagedWorktree: createMember,
      removeManagedWorktree: vi.fn(),
      waitForSetupTerminalCompletion: vi.fn()
    }
  })
})

afterEach(async () => {
  await service.close()
  await rm(root, { recursive: true, force: true })
})

it('does not acknowledge a root or create members when profile persistence fails', async () => {
  flushProfile.mockRejectedValueOnce(new Error('profile write failed'))
  await expect(service.run(taskId)).rejects.toThrow('profile write failed')
  const saved = journal.get(taskId)!
  expect(saved.root.folderRegistration).toBe('creating')
  expect(saved.root.folderWorkspaceId).toBeUndefined()
  expect(saved.members.every((member) => member.state === 'planned')).toBe(true)
  expect(createMember).not.toHaveBeenCalled()
})

it('persists the root entry before acknowledging it and starting Git creation', async () => {
  flushProfile.mockImplementationOnce(async () => {
    expect(folders).toHaveLength(1)
    expect(journal.get(taskId)?.root.folderRegistration).toBe('creating')
    expect(createMember).not.toHaveBeenCalled()
  })
  await service.run(taskId)
  expect(flushProfile).toHaveBeenCalledOnce()
  expect(createMember).toHaveBeenCalledOnce()
  expect(journal.get(taskId)?.root.folderRegistration).toBe('registered')
})
