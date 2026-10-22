import { beforeEach, expect, it, vi } from 'vitest'
import type { FolderWorkspace, WorkspaceKey } from '../../shared/folder-workspace-types'
import type { WorkspaceLineage } from '../../shared/worktree/lineage-types'
import type { MultiRepoTask } from '../../shared/multi-repo-workspaces/multi-repo-workspace-contract'
import { recoverMultiRepoMemberLineage } from './multi-repo-workspace-lineage-recovery'

let task: MultiRepoTask
let folder: FolderWorkspace | undefined
let lineages: Record<WorkspaceKey, WorkspaceLineage>
const setLineage = vi.fn((lineage: WorkspaceLineage) => {
  lineages[lineage.childWorkspaceKey] = lineage
  return lineage
})
const store = {
  getRepos: () => [],
  getWorktreeMeta: () => undefined,
  getFolderWorkspace: () => folder,
  getAllWorkspaceLineage: () => lineages,
  setWorkspaceLineage: setLineage
}
const childKey = 'worktree:api::/tasks/a/api'
beforeEach(() => {
  setLineage.mockClear()
  lineages = {}
  task = {
    schemaVersion: 1,
    taskId: 'task',
    requestId: 'task',
    revision: 1,
    profileId: 'profile',
    hostId: 'local',
    name: 'Task',
    prompt: '',
    plan: { parentPath: '/tasks', rootPath: '/tasks/a', members: [] },
    root: { state: 'created', folderWorkspaceId: 'root', projectGroupId: 'group' },
    members: [
      {
        repoId: 'api',
        state: 'registered',
        setup: 'pending',
        worktreeId: 'api::/tasks/a/api',
        instanceId: 'instance',
        plannedInstanceId: 'instance'
      }
    ],
    agent: { state: 'pending' }
  }
  folder = {
    id: 'root',
    name: 'Task',
    projectGroupId: 'group',
    folderPath: '/tasks/a',
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
})

it('uses normal lineage recording and preserves it on repeated recovery', () => {
  recoverMultiRepoMemberLineage(task, task.members[0], store)
  const saved = lineages[childKey]
  expect(saved).toMatchObject({
    childWorkspaceKey: childKey,
    childInstanceId: 'instance',
    parentWorkspaceKey: 'folder:root',
    parentInstanceId: null,
    origin: 'cli',
    capture: { source: 'explicit-cli-flag', confidence: 'explicit' }
  })
  recoverMultiRepoMemberLineage(task, task.members[0], store)
  expect(setLineage).toHaveBeenCalledOnce()
  expect(lineages[childKey]).toBe(saved)
})

it('recovers a lost write reply without recording lineage twice', () => {
  setLineage.mockImplementationOnce((lineage) => {
    lineages[lineage.childWorkspaceKey] = lineage
    throw new Error('reply lost')
  })
  expect(() => recoverMultiRepoMemberLineage(task, task.members[0], store)).toThrow('reply lost')
  recoverMultiRepoMemberLineage(task, task.members[0], store)
  expect(setLineage).toHaveBeenCalledOnce()
})

it.each(['parent', 'child-instance', 'parent-instance'])(
  'preserves a conflicting existing %s',
  (conflict) => {
    recoverMultiRepoMemberLineage(task, task.members[0], store)
    const existing = lineages[childKey]
    if (conflict === 'parent') {
      existing.parentWorkspaceKey = 'folder:user-choice'
    }
    if (conflict === 'child-instance') {
      existing.childInstanceId = 'replacement'
    }
    if (conflict === 'parent-instance') {
      existing.parentInstanceId = 'unexpected'
    }
    expect(() => recoverMultiRepoMemberLineage(task, task.members[0], store)).toThrow(
      'lineage was changed'
    )
    expect(setLineage).toHaveBeenCalledOnce()
    expect(lineages[childKey]).toBe(existing)
  }
)

it.each(['missing', 'path', 'group', 'ssh', 'host'])(
  'rejects a changed root entry (%s)',
  (change) => {
    if (!folder) {
      throw new Error('Missing fixture')
    }
    if (change === 'missing') {
      folder = undefined
    } else if (change === 'path') {
      folder.folderPath = '/tasks/other'
    } else if (change === 'group') {
      folder.projectGroupId = 'other'
    } else if (change === 'ssh') {
      folder.connectionId = 'ssh'
    } else {
      folder.executionHostId = 'ssh:other'
    }
    expect(() => recoverMultiRepoMemberLineage(task, task.members[0], store)).toThrow(
      'root entry changed'
    )
    expect(setLineage).not.toHaveBeenCalled()
  }
)

it.each(['ready', 'no-instance', 'changed-instance'])(
  'refuses to recreate lineage outside interrupted creation (%s)',
  (change) => {
    if (change === 'ready') {
      task.members[0].setup = 'skipped'
    }
    if (change === 'no-instance') {
      task.members[0].instanceId = undefined
    }
    if (change === 'changed-instance') {
      task.members[0].instanceId = 'other'
    }
    expect(() => recoverMultiRepoMemberLineage(task, task.members[0], store)).toThrow(
      'lineage intent'
    )
    expect(setLineage).not.toHaveBeenCalled()
  }
)
