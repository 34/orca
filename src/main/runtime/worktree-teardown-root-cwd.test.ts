import { beforeEach, expect, it, vi } from 'vitest'
import type { IPtyProvider, PtyProcessInfo } from '../providers/pty-provider-contract'
const { listRegisteredPtysMock } = vi.hoisted(() => ({ listRegisteredPtysMock: vi.fn() }))
vi.mock('../memory/pty-registry', () => ({ listRegisteredPtys: listRegisteredPtysMock }))
import { killAllProcessesForWorktree } from './worktree-teardown'

function createProviderStub(listProcesses: () => Promise<PtyProcessInfo[]>): IPtyProvider {
  const provider = {
    listProcesses: vi.fn(listProcesses),
    shutdown: vi.fn().mockResolvedValue(undefined)
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: These teardown paths only call listProcesses and shutdown; no terminal creation or event subscription occurs.
  return provider as unknown as IPtyProvider
}
beforeEach(() => {
  listRegisteredPtysMock.mockReset()
})

it('uses a verified local folder root only for untagged PTYs inside that root', async () => {
  const localProvider = createProviderStub(async () => [
    { id: 'inside', cwd: '/tasks/one/api', title: 'service' },
    { id: 'prefix-neighbor', cwd: '/tasks/one-more', title: 'shell' },
    {
      id: 'member-owned',
      cwd: '/tasks/one/api',
      title: 'shell',
      worktreeId: 'api::/tasks/one/api'
    }
  ])
  listRegisteredPtysMock.mockReturnValue([])
  const result = await killAllProcessesForWorktree('folder:task', {
    localProvider,
    resolvedConnectionId: null,
    verifiedLocalRootPath: '/tasks/one',
    requirePhysicalStop: true
  })
  expect(result.providerStopped).toBe(1)
  expect(localProvider.shutdown).toHaveBeenCalledExactlyOnceWith(
    'inside',
    expect.objectContaining({ immediate: true })
  )
})

it('refuses cleanup when an untagged root PTY remains live after shutdown', async () => {
  const localProvider = createProviderStub(async () => [
    { id: 'busy', cwd: '/tasks/one/api', title: 'service' }
  ])
  vi.mocked(localProvider.shutdown).mockRejectedValue(new Error('stop failed'))
  listRegisteredPtysMock.mockReturnValue([])
  await expect(
    killAllProcessesForWorktree('folder:task', {
      localProvider,
      resolvedConnectionId: null,
      verifiedLocalRootPath: '/tasks/one',
      requirePhysicalStop: true
    })
  ).rejects.toThrow()
  expect(localProvider.shutdown).toHaveBeenCalledWith(
    'busy',
    expect.objectContaining({ immediate: true })
  )
})

it.each([undefined, 'ssh-host'])(
  'rejects a local root path under a non-local fence %s',
  async (resolvedConnectionId) => {
    const localProvider = createProviderStub(async () => [])
    await expect(
      killAllProcessesForWorktree('folder:task', {
        localProvider,
        resolvedConnectionId,
        verifiedLocalRootPath: '/tasks/one',
        requirePhysicalStop: true
      })
    ).rejects.toThrow('explicit local host fence')
    expect(localProvider.listProcesses).not.toHaveBeenCalled()
    expect(localProvider.shutdown).not.toHaveBeenCalled()
  }
)
