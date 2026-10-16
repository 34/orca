import { beforeEach, expect, it, vi } from 'vitest'
import type { Store } from '../persistence'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, input?: unknown) => unknown>(),
  trusted: true,
  profileId: 'profile-a',
  list: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  run: vi.fn(),
  close: vi.fn(),
  previewRemoval: vi.fn(),
  previewCreate: vi.fn(),
  stopRootForCleanup: vi.fn(),
  skipSetup: vi.fn(),
  restoreRoot: vi.fn(),
  removeRoot: vi.fn(),
  removeMember: vi.fn()
}))
vi.mock('electron', () => ({
  ipcMain: {
    handle: (name: string, fn: (event: unknown, input?: unknown) => unknown) =>
      mocks.handlers.set(name, fn)
  }
}))
vi.mock('../ipc/ui', () => ({ isTrustedUIRenderer: () => mocks.trusted }))
vi.mock('../orca-profiles/profile-index-store', () => ({
  getOrcaProfileListState: () => ({ activeProfileId: mocks.profileId })
}))
vi.mock('../orca-profiles/profile-storage-paths', () => ({
  getOrcaProfileDirectory: () => '/unused'
}))
vi.mock('./multi-repo-workspace-plan', () => ({ planMultiRepoWorkspace: mocks.previewCreate }))
vi.mock('./multi-repo-workspace-store', () => ({
  MultiRepoWorkspaceStore: class {
    list = mocks.list
    get = mocks.get
  }
}))
vi.mock('./multi-repo-workspace-service', () => ({
  MultiRepoWorkspaceService: class {
    create = mocks.create
    run = mocks.run
    close = mocks.close
    previewRemoval = mocks.previewRemoval
    stopRootForCleanup = mocks.stopRootForCleanup
    skipSetup = mocks.skipSetup
    restoreRoot = mocks.restoreRoot
    removeRoot = mocks.removeRoot
    removeMember = mocks.removeMember
  }
}))
import {
  registerMultiRepoWorkspaceHandlers,
  closeMultiRepoWorkspaceOwner
} from './multi-repo-workspace-ipc'

const frame = {}
const event = { sender: { mainFrame: frame }, senderFrame: frame }
// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: The mocked service and journal never dereference the store in these IPC boundary tests.
const store = {} as Store
// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: No group initialization runs; the mocked service never calls the runtime.
const runtime = {} as OrcaRuntimeService
function invoke(name: string, input?: unknown, sender = event): unknown {
  const handler = mocks.handlers.get(`multiRepoWorkspaces:${name}`)
  if (!handler) {
    throw new Error('Missing handler')
  }
  return handler(sender, input)
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.handlers.clear()
  mocks.profileId = 'profile-a'
  mocks.trusted = true
  mocks.run.mockResolvedValue(undefined)
  registerMultiRepoWorkspaceHandlers(store, runtime)
})
it('rejects untrusted renderers and child frames before reading records', () => {
  mocks.trusted = false
  expect(() => invoke('list')).toThrow('Unauthorized')
  mocks.trusted = true
  expect(() => invoke('list', undefined, { ...event, senderFrame: {} })).toThrow('Unauthorized')
  expect(mocks.list).not.toHaveBeenCalled()
})
it('rejects stale profile requests', () => {
  mocks.profileId = 'profile-b'
  expect(() => invoke('list')).toThrow('inactive profile')
  expect(mocks.list).not.toHaveBeenCalled()
})
it('rejects invalid IDs and create payloads before calling the service', async () => {
  expect(() => invoke('get', '../escape')).toThrow()
  await expect(invoke('create', { requestId: 'invalid' })).rejects.toThrow()
  expect(mocks.get).not.toHaveBeenCalled()
  expect(mocks.create).not.toHaveBeenCalled()
})
it('returns a saved task and starts its background run once', async () => {
  const request = {
    requestId: '19fb161a-7960-4d53-ae89-879c25b5395e',
    name: 'Task',
    prompt: '',
    parentPath: '/tasks',
    directoryName: 'task',
    members: [
      {
        repoId: 'api',
        directoryName: 'api',
        baseRef: 'main',
        branchName: 'task/a',
        setupDecision: 'skip'
      }
    ]
  }
  mocks.create.mockResolvedValue({ taskId: request.requestId })
  await expect(invoke('create', request)).resolves.toEqual({ taskId: request.requestId })
  expect(mocks.run).toHaveBeenCalledWith(request.requestId)
  await closeMultiRepoWorkspaceOwner(store)
  expect(mocks.close).toHaveBeenCalledOnce()
})

it('validates cleanup preview authority and task IDs before reading Git', () => {
  expect(() => invoke('previewRemoval', '../escape')).toThrow()
  mocks.trusted = false
  expect(() => invoke('previewRemoval', '19fb161a-7960-4d53-ae89-879c25b5395e')).toThrow(
    'Unauthorized'
  )
  expect(mocks.previewRemoval).not.toHaveBeenCalled()
  mocks.trusted = true
  invoke('previewRemoval', '19fb161a-7960-4d53-ae89-879c25b5395e')
  expect(mocks.previewRemoval).toHaveBeenCalledWith('19fb161a-7960-4d53-ae89-879c25b5395e')
})

it('guards root stop authority before dispatching a session shutdown', () => {
  expect(() => invoke('stopRootForCleanup', '../escape')).toThrow()
  mocks.trusted = false
  expect(() => invoke('stopRootForCleanup', '19fb161a-7960-4d53-ae89-879c25b5395e')).toThrow(
    'Unauthorized'
  )
  expect(mocks.stopRootForCleanup).not.toHaveBeenCalled()
  mocks.trusted = true
  invoke('stopRootForCleanup', '19fb161a-7960-4d53-ae89-879c25b5395e')
  expect(mocks.stopRootForCleanup).toHaveBeenCalledOnce()
})

it('requires a versioned member cleanup request from a trusted current profile', () => {
  const request = { taskId: '19fb161a-7960-4d53-ae89-879c25b5395e', repoId: 'api', revision: 3 }
  expect(() => invoke('removeMember', { ...request, revision: -1 })).toThrow()
  expect(() => invoke('removeMember', { ...request, force: true })).toThrow()
  mocks.trusted = false
  expect(() => invoke('removeMember', request)).toThrow('Unauthorized')
  expect(mocks.removeMember).not.toHaveBeenCalled()
  mocks.trusted = true
  invoke('removeMember', request)
  expect(mocks.removeMember).toHaveBeenCalledWith(request.taskId, 'api', 3)
})

it('authorizes and validates root cleanup before forwarding the exact revision', () => {
  const input = { taskId: '19fb161a-7960-4d53-ae89-879c25b5395e', revision: 4 }
  expect(() => invoke('removeRoot', { ...input, revision: -1 })).toThrow()
  mocks.trusted = false
  expect(() => invoke('removeRoot', input)).toThrow()
  mocks.trusted = true
  invoke('removeRoot', input)
  expect(mocks.removeRoot).toHaveBeenCalledWith(input.taskId, 4)
})

it('authorizes and validates explicit root restoration', () => {
  const input = { taskId: '19fb161a-7960-4d53-ae89-879c25b5395e', revision: 2 }
  expect(() => invoke('restoreRoot', { ...input, extra: true })).toThrow()
  mocks.profileId = 'other-profile'
  expect(() => invoke('restoreRoot', input)).toThrow('inactive profile')
  mocks.profileId = 'profile-a'
  invoke('restoreRoot', input)
  expect(mocks.restoreRoot).toHaveBeenCalledWith(input.taskId, 2)
})

it('authorizes and validates explicit setup skips', () => {
  const input = { taskId: '00000000-0000-4000-8000-000000000001', repoId: 'api', revision: 2 }
  expect(() => invoke('skipSetup', { ...input, force: true })).toThrow()
  expect(() => invoke('skipSetup', { ...input, revision: -1 })).toThrow()
  expect(() => invoke('skipSetup', input, { ...event, senderFrame: {} })).toThrow('Unauthorized')
  mocks.profileId = 'other'
  expect(() => invoke('skipSetup', input)).toThrow('inactive profile')
  expect(mocks.skipSetup).not.toHaveBeenCalled()
  mocks.profileId = 'profile-a'
  invoke('skipSetup', input)
  expect(mocks.skipSetup).toHaveBeenCalledWith(input.taskId, 'api', 2)
})

it('previews without creating and rechecks profile authority after Git reads', async () => {
  const request = {
    requestId: '19fb161a-7960-4d53-ae89-879c25b5395e',
    name: 'Task',
    prompt: '',
    parentPath: '/tasks',
    directoryName: 'task',
    members: [
      {
        repoId: 'api',
        directoryName: 'api',
        baseRef: 'main',
        branchName: 'task/a',
        setupDecision: 'skip'
      }
    ]
  }
  await expect(invoke('previewCreate', {})).rejects.toThrow()
  mocks.trusted = false
  await expect(invoke('previewCreate', request)).rejects.toThrow('Unauthorized')
  expect(mocks.previewCreate).not.toHaveBeenCalled()
  mocks.trusted = true
  mocks.previewCreate.mockResolvedValue({ rootPath: '/tasks/task' })
  await expect(invoke('previewCreate', request)).resolves.toEqual({ rootPath: '/tasks/task' })
  expect(mocks.create).not.toHaveBeenCalled()
  expect(mocks.run).not.toHaveBeenCalled()
  mocks.previewCreate.mockImplementation(async () => {
    mocks.profileId = 'profile-b'
    return { rootPath: '/tasks/task' }
  })
  await expect(invoke('previewCreate', request)).rejects.toThrow('inactive profile')
})
