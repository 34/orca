import { beforeEach, expect, it, vi } from 'vitest'
import type { Worktree } from '../../../../shared/worktree/types'
import type { MultiRepoTask } from '../../../../shared/multi-repo-workspaces/multi-repo-workspace-contract'
const mocks = vi.hoisted(() => ({
  refresh: vi.fn(async () => true),
  known: vi.fn<() => Partial<Worktree> | undefined>(),
  activate: vi.fn<() => { primaryTabId: null } | false>()
}))
vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => ({ fetchWorktrees: mocks.refresh, getKnownWorktreeById: mocks.known })
  }
}))
vi.mock('@/lib/worktree-activation', () => ({ activateAndRevealWorktree: mocks.activate }))
import { openMultiRepoMember } from './open-multi-repo-member'
const task: MultiRepoTask = {
  schemaVersion: 1,
  taskId: 'task',
  requestId: 'task',
  revision: 1,
  profileId: 'profile',
  hostId: 'local',
  name: 'Task',
  prompt: '',
  plan: {
    parentPath: '/tasks',
    rootPath: '/tasks/a',
    members: [
      {
        repoId: 'api',
        directoryName: 'api',
        repoPath: '/repos/api',
        commonDir: '/repos/api/.git',
        baseRef: 'HEAD',
        baseCommit: 'a'.repeat(40),
        branchName: 'task/a',
        setupDecision: 'skip',
        worktreePath: '/tasks/a/api'
      }
    ]
  },
  root: { state: 'created' },
  members: [
    {
      repoId: 'api',
      worktreeId: 'api::/tasks/a/api',
      instanceId: 'original',
      state: 'ready',
      setup: 'skipped'
    }
  ],
  agent: { state: 'pending' }
}
const current: Partial<Worktree> = {
  id: 'api::/tasks/a/api',
  repoId: 'api',
  path: '/tasks/a/api',
  instanceId: 'original',
  hostId: 'local'
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.refresh.mockResolvedValue(true)
  mocks.known.mockReturnValue(current)
  mocks.activate.mockReturnValue({ primaryTabId: null })
})
it('refreshes the execution host before activating the exact member', async () => {
  await openMultiRepoMember(task, 'api')
  expect(mocks.refresh).toHaveBeenCalledWith('api', {
    executionHostId: 'local',
    requireAuthoritative: true
  })
  expect(mocks.known).toHaveBeenCalledWith('api::/tasks/a/api', 'local')
  expect(mocks.activate).toHaveBeenCalledWith('api::/tasks/a/api', {
    executionHostId: 'local',
    navigationIntent: 'user-open',
    agent: null
  })
  expect(mocks.refresh.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.known.mock.invocationCallOrder[0]
  )
})
it('does not activate cached metadata after an unsuccessful refresh', async () => {
  mocks.refresh.mockResolvedValue(false)
  await expect(openMultiRepoMember(task, 'api')).rejects.toThrow('Cannot verify')
  expect(mocks.known).not.toHaveBeenCalled()
  expect(mocks.activate).not.toHaveBeenCalled()
})
it.each<Partial<Worktree> | undefined>([
  undefined,
  { ...current, instanceId: 'replacement' },
  { ...current, path: '/other' },
  { ...current, repoId: 'other' },
  { ...current, hostId: 'ssh:remote' },
  { ...current, runtimeOwnerEnvironmentId: 'remote-env' },
  { ...current, removing: true }
])('refuses changed or unavailable member ownership (%j)', async (row) => {
  mocks.known.mockReturnValue(row)
  await expect(openMultiRepoMember(task, 'api')).rejects.toThrow('identity changed')
  expect(mocks.activate).not.toHaveBeenCalled()
})
it('does not refresh or open members already being removed', async () => {
  const removing: MultiRepoTask = { ...task, members: [{ ...task.members[0], state: 'removing' }] }
  await expect(openMultiRepoMember(removing, 'api')).rejects.toThrow('entered cleanup')
  expect(mocks.refresh).not.toHaveBeenCalled()
  expect(mocks.activate).not.toHaveBeenCalled()
})
it('reports an activation refusal so the manager remains open', async () => {
  mocks.activate.mockReturnValue(false)
  await expect(openMultiRepoMember(task, 'api')).rejects.toThrow('entry is unavailable')
})
