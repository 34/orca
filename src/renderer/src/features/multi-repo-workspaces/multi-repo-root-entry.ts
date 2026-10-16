import type { AppState } from '@/store'
import { getFolderWorkspaceHostId } from '@/store/folder-workspaces/folder-workspace-catalog'
import type { MultiRepoTask } from '../../../../shared/multi-repo-workspaces/multi-repo-workspace-contract'

export function multiRepoRootEntry(
  task: {
    root: Pick<MultiRepoTask['root'], 'state' | 'folderWorkspaceId' | 'projectGroupId'>
    plan: Pick<MultiRepoTask['plan'], 'rootPath'>
  },
  state: Pick<AppState, 'folderWorkspaces' | 'projectGroups'>
) {
  if (task.root.state !== 'created') {
    return undefined
  }
  return state.folderWorkspaces.find(
    (folder) =>
      folder.id === task.root.folderWorkspaceId &&
      folder.folderPath === task.plan.rootPath &&
      folder.projectGroupId === task.root.projectGroupId &&
      getFolderWorkspaceHostId(folder, state.projectGroups) === 'local'
  )
}
