import type { Store } from '../persistence'
import type { MultiRepoTask } from '../../shared/multi-repo-workspaces/multi-repo-workspace-contract'
import type { RuntimeRepositoryCommandSurface } from '../runtime/runtime-repository-command-surface'
import type { MultiRepoWorkspaceStore } from './multi-repo-workspace-store'
import { areWorktreePathsEqual } from '../git/worktree-path-comparison'
import {
  reconcileMultiRepoRootRegistration,
  verifyMultiRepoRootOwnership
} from './multi-repo-workspace-root-registration'

export async function restoreMultiRepoRoot(args: {
  taskId: string
  revision: number
  journal: MultiRepoWorkspaceStore
  store: Pick<Store, 'flushPendingOrThrowAsync'>
  runtime: Pick<
    RuntimeRepositoryCommandSurface,
    'listFolderWorkspaces' | 'createFolderWorkspace' | 'listProjectGroups'
  >
}): Promise<MultiRepoTask> {
  const existing = args.journal.get(args.taskId)
  if (!existing || existing.revision !== args.revision) {
    throw new Error('Task changed; refresh before restoring the root entry')
  }
  let task = existing
  if (task.root.state !== 'created' || !task.root.projectGroupId) {
    throw new Error('Only an existing task root with a recorded project group can be restored')
  }
  try {
    await verifyMultiRepoRootOwnership(task)
    const group = args.runtime
      .listProjectGroups()
      .find((entry) => entry.id === task.root.projectGroupId)
    if (
      !group ||
      group.connectionId ||
      (group.executionHostId && group.executionHostId !== 'local')
    ) {
      throw new Error(
        'Original local project group is missing or changed; restore it before the root entry'
      )
    }
    const folders = args.runtime.listFolderWorkspaces()
    const prior = folders.find((entry) => entry.id === task.root.folderWorkspaceId)
    if (prior) {
      return await reconcileMultiRepoRootRegistration({
        task,
        journal: args.journal,
        listFolders: () => folders,
        recover: false
      })
    }
    const matches = folders.filter(
      (entry) =>
        !entry.connectionId &&
        (!entry.executionHostId || entry.executionHostId === 'local') &&
        areWorktreePathsEqual(entry.folderPath, task.plan.rootPath)
    )
    if (
      matches.length > 1 ||
      (matches[0] && matches[0].projectGroupId !== task.root.projectGroupId)
    ) {
      throw new Error('Root workspace entries are ambiguous or belong to another group')
    }
    if (matches.length === 1) {
      task.root.folderWorkspaceId = matches[0].id
    } else {
      task.root.folderWorkspaceId = undefined
      task.root.folderRegistration = 'creating'
      task.root.error = undefined
      task = args.journal.save(task, task.revision)
      const folder = await args.runtime.createFolderWorkspace({
        projectGroupId: task.root.projectGroupId!,
        name: task.name,
        folderPath: task.plan.rootPath,
        connectionId: null
      })
      task.root.folderWorkspaceId = folder.id
    }
    await args.store.flushPendingOrThrowAsync()
    task.root.folderRegistration = 'registered'
    return await reconcileMultiRepoRootRegistration({
      task,
      journal: args.journal,
      listFolders: () => args.runtime.listFolderWorkspaces(),
      recover: false
    })
  } catch (error) {
    task.root.error = error instanceof Error ? error.message : String(error)
    // Reconciliation may have already persisted its refusal.
    if (args.journal.get(task.taskId)?.revision === task.revision) {
      args.journal.save(task, task.revision)
    }
    throw error
  }
}
