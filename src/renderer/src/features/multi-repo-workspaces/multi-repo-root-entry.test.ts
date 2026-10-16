import { expect, it } from 'vitest'
import type { FolderWorkspace } from '../../../../shared/folder-workspace-types'
import type { ProjectGroup } from '../../../../shared/project-group-types'
import { multiRepoRootEntry } from './multi-repo-root-entry'
const task = {
  root: { state: 'created' as const, folderWorkspaceId: 'folder', projectGroupId: 'group' },
  plan: { rootPath: '/task' }
}
const folder: FolderWorkspace = {
  id: 'folder',
  projectGroupId: 'group',
  name: 'Current display name',
  folderPath: '/task',
  linkedTask: null,
  comment: '',
  isArchived: true,
  isUnread: false,
  isPinned: false,
  sortOrder: 0,
  lastActivityAt: 0,
  createdAt: 0,
  updatedAt: 0
}
const group: ProjectGroup = {
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
it('uses current folder name and archive state without modifying the creation record', () => {
  expect(multiRepoRootEntry(task, { folderWorkspaces: [folder], projectGroups: [group] })).toBe(
    folder
  )
})
it.each([
  { folderPath: '/other' },
  { projectGroupId: 'other' },
  { id: 'other' },
  { connectionId: 'ssh-a' },
  { executionHostId: 'ssh:a' as const }
])('does not expose controls for a changed root owner (%j)', (change) => {
  expect(
    multiRepoRootEntry(task, {
      folderWorkspaces: [{ ...folder, ...change }],
      projectGroups: [group]
    })
  ).toBeUndefined()
})
it('honors the group host and excludes completed roots', () => {
  expect(
    multiRepoRootEntry(task, {
      folderWorkspaces: [folder],
      projectGroups: [{ ...group, connectionId: 'ssh-a' }]
    })
  ).toBeUndefined()
  expect(
    multiRepoRootEntry(
      { ...task, root: { ...task.root, state: 'removed' } },
      { folderWorkspaces: [folder], projectGroups: [group] }
    )
  ).toBeUndefined()
})
