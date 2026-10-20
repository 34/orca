// @vitest-environment happy-dom
import { setRendererUiLanguage } from '@/i18n/i18n'
import { act, cleanup, render, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { MultiRepoTask } from '../../../../shared/multi-repo-workspaces/multi-repo-workspace-contract'
import { MultiRepoWorkspaceTaskDetails } from './MultiRepoWorkspaceTaskDetails'

type TestFolder = { id: string; name: string; isArchived: boolean }
const mocks = vi.hoisted(() => {
  const folder: { current?: TestFolder } = {}
  return {
    folder,
    activate: vi.fn(() => true),
    get: vi.fn(),
    confirm: vi.fn(),
    restart: vi.fn()
  }
})
vi.mock('@/store', () => ({ useAppStore: () => mocks.folder.current }))
vi.mock('@/lib/worktree-activation', () => ({
  activateAndRevealFolderWorkspace: mocks.activate
}))
vi.mock('./open-multi-repo-member', () => ({ openMultiRepoMember: vi.fn() }))
vi.mock('./MultiRepoAddRepositories', () => ({ MultiRepoAddRepositories: () => null }))
vi.mock('./MultiRepoRootSettings', () => ({ MultiRepoRootSettings: () => null }))
vi.mock('./MultiRepoRemovalPreview', () => ({ MultiRepoRemovalPreview: () => null }))
vi.mock('@/components/confirmation-dialog-context', () => ({
  useConfirmationDialog: () => mocks.confirm
}))
const task: MultiRepoTask = {
  schemaVersion: 1,
  taskId: 'task',
  requestId: 'task',
  revision: 1,
  profileId: 'profile',
  hostId: 'local',
  name: 'Task',
  prompt: '',
  root: { state: 'created', folderWorkspaceId: 'folder' },
  plan: {
    parentPath: '/tasks',
    rootPath: '/tasks/task',
    members: [
      {
        repoId: 'repo',
        directoryName: 'api',
        baseRef: 'HEAD',
        branchName: 'task/test',
        setupDecision: 'skip',
        repoPath: '/source',
        commonDir: '/source/.git',
        baseCommit: 'a'.repeat(40),
        worktreePath: '/tasks/task/api'
      }
    ]
  },
  members: [{ repoId: 'repo', state: 'ready', setup: 'skipped' }],
  agent: { state: 'pending', operationId: 'operation' }
}
beforeEach(() => {
  vi.useFakeTimers()
  mocks.folder.current = { id: 'folder', name: 'Task', isArchived: false }
  mocks.activate.mockReset().mockReturnValue(true)
  mocks.get.mockReset().mockResolvedValue(task)
  mocks.confirm.mockReset().mockResolvedValue(false)
  mocks.restart.mockReset()
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { multiRepoWorkspaces: { get: mocks.get, restartAgent: mocks.restart } }
  })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
it('opens a newly completed task once and leaves historical details open', async () => {
  const onOpen = vi.fn()
  const view = render(<MultiRepoWorkspaceTaskDetails initialTask={task} onOpen={onOpen} />)
  await act(async () => {})
  expect(mocks.activate).not.toHaveBeenCalled()
  view.rerender(<MultiRepoWorkspaceTaskDetails initialTask={task} openWhenReady onOpen={onOpen} />)
  await act(() => vi.advanceTimersByTimeAsync(3000))
  expect(mocks.activate).toHaveBeenCalledExactlyOnceWith('folder', { executionHostId: 'local' })
  expect(onOpen).toHaveBeenCalledTimes(1)
})
it.each(['setup', 'agent', 'warning', 'folder'] as const)(
  'waits for %s before opening',
  async (reason) => {
    const current = structuredClone(task)
    if (reason === 'setup') {
      current.members[0].setup = 'running'
    }
    if (reason === 'agent') {
      current.agent = { ...current.agent, selected: 'codex', state: 'failed' }
    }
    if (reason === 'warning') {
      current.members[0].error = 'Some files were not copied'
    }
    if (reason === 'folder') {
      mocks.folder.current = undefined
    }
    mocks.get.mockResolvedValue(current)
    const onOpen = vi.fn()
    render(<MultiRepoWorkspaceTaskDetails initialTask={current} openWhenReady onOpen={onOpen} />)
    await act(() => vi.advanceTimersByTimeAsync(1500))
    expect(mocks.activate).not.toHaveBeenCalled()
    mocks.folder.current = { id: 'folder', name: 'Task', isArchived: false }
    mocks.get.mockResolvedValue({
      ...task,
      revision: 2,
      agent: reason === 'agent' ? { ...current.agent, state: 'started' } : task.agent
    })
    await act(() => vi.advanceTimersByTimeAsync(1500))
    expect(onOpen).toHaveBeenCalledTimes(1)
  }
)
it('does not navigate after the creation dialog is closed', async () => {
  const current = { ...task, members: [{ ...task.members[0], setup: 'running' as const }] }
  mocks.get.mockResolvedValue(current)
  const view = render(
    <MultiRepoWorkspaceTaskDetails initialTask={current} openWhenReady onOpen={vi.fn()} />
  )
  await act(async () => {})
  view.unmount()
  mocks.get.mockResolvedValue(task)
  await act(() => vi.advanceTimersByTimeAsync(3000))
  expect(mocks.activate).not.toHaveBeenCalled()
})
it('does not repeatedly attempt a blocked activation', async () => {
  mocks.activate.mockReturnValue(false)
  const onOpen = vi.fn()
  render(<MultiRepoWorkspaceTaskDetails initialTask={task} openWhenReady onOpen={onOpen} />)
  await act(() => vi.advanceTimersByTimeAsync(3000))
  expect(mocks.activate).toHaveBeenCalledTimes(1)
  expect(onOpen).not.toHaveBeenCalled()
})

it('renders current-language phases after changing language', async () => {
  vi.useRealTimers()
  const view = render(<MultiRepoWorkspaceTaskDetails initialTask={task} onOpen={vi.fn()} />)
  expect(view.getByRole('button', { name: 'Open root workspace' })).toBeTruthy()
  expect(view.container.textContent).toContain('Ready')
  try {
    await act(() => setRendererUiLanguage('zh'))
    view.rerender(<MultiRepoWorkspaceTaskDetails initialTask={task} onOpen={vi.fn()} />)
    expect(view.getByRole('button', { name: '打开根工作区' })).toBeTruthy()
    expect(view.container.textContent).toContain('已就绪')
  } finally {
    await act(() => setRendererUiLanguage('en'))
  }
})

it('asks for a new session after membership changes instead of showing a live launch', async () => {
  const current = structuredClone(task)
  current.agent = { ...current.agent, selected: 'codex', state: 'started', relaunchRequired: true }
  mocks.get.mockResolvedValue(current)
  const view = render(<MultiRepoWorkspaceTaskDetails initialTask={current} onOpen={vi.fn()} />)
  await act(async () => {})
  expect(view.container.textContent).toContain('Start a new session')
  expect(view.container.textContent).toContain('Membership changed.')
  expect(view.container.textContent).not.toContain('codex · Started')
})

it.each([false, true])('restarts the root only after confirmation (%s)', async (accepted) => {
  setRendererUiLanguage('en')
  const current = structuredClone(task)
  current.agent = { selected: 'cursor', state: 'started', relaunchRequired: true }
  mocks.get.mockResolvedValue(current)
  mocks.confirm.mockResolvedValue(accepted)
  mocks.restart.mockResolvedValue({
    ...current,
    revision: 2,
    agent: { selected: 'cursor', state: 'started' }
  })
  const view = render(<MultiRepoWorkspaceTaskDetails initialTask={current} onOpen={vi.fn()} />)
  await act(async () => {
    fireEvent.click(view.getByRole('button', { name: 'Restart root agent' }))
  })
  expect(mocks.confirm).toHaveBeenCalledOnce()
  expect(mocks.restart).toHaveBeenCalledTimes(accepted ? 1 : 0)
  if (accepted) {
    expect(mocks.restart).toHaveBeenCalledWith({ taskId: current.taskId, revision: 1 })
  }
})
