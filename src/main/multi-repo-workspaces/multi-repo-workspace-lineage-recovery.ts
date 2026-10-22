import type { MultiRepoTask } from '../../shared/multi-repo-workspaces/multi-repo-workspace-contract'
import { folderWorkspaceKey, worktreeWorkspaceKey } from '../../shared/workspace-scope'
import type { RuntimeStore } from '../runtime/runtime-store-contract'
import { recordCreatedWorktreeLineage } from '../runtime/runtime-worktree-lineage-recording'

export type MultiRepoLineageStore = Required<
  Pick<RuntimeStore, 'getFolderWorkspace' | 'getAllWorkspaceLineage' | 'setWorkspaceLineage'>
> &
  Pick<RuntimeStore, 'getRepos' | 'getWorktreeMeta'>

// Called only after member registration and Git identity have been verified.
export function recoverMultiRepoMemberLineage(
  task: MultiRepoTask,
  member: MultiRepoTask['members'][number],
  store: MultiRepoLineageStore
): void {
  if (
    !task.root.folderWorkspaceId ||
    !member.worktreeId ||
    !member.instanceId ||
    member.instanceId !== member.plannedInstanceId ||
    member.setup !== 'pending'
  ) {
    throw new Error('Missing interrupted member lineage intent')
  }
  const folder = store.getFolderWorkspace(task.root.folderWorkspaceId)
  if (
    !folder ||
    folder.folderPath !== task.plan.rootPath ||
    folder.projectGroupId !== task.root.projectGroupId ||
    folder.connectionId ||
    (folder.executionHostId && folder.executionHostId !== 'local')
  ) {
    throw new Error('Multi-repo root entry changed before lineage recovery')
  }
  const childKey = worktreeWorkspaceKey(member.worktreeId)
  const parentKey = folderWorkspaceKey(folder.id)
  const existing = store.getAllWorkspaceLineage()[childKey]
  if (existing) {
    if (
      existing.childInstanceId !== member.instanceId ||
      existing.parentWorkspaceKey !== parentKey ||
      existing.parentInstanceId != null
    ) {
      throw new Error('Member lineage was changed; preserve it for review')
    }
    return
  }
  recordCreatedWorktreeLineage(
    store,
    { id: member.worktreeId, instanceId: member.instanceId, hostId: 'local' },
    {
      kind: 'lineage',
      parent: {
        type: 'folder',
        workspaceKey: parentKey,
        folderWorkspace: folder,
        instanceId: null
      },
      origin: 'cli',
      capture: { source: 'explicit-cli-flag', confidence: 'explicit' }
    }
  )
}
