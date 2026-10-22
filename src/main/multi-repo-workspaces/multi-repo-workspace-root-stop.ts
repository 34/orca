import type { MultiRepoTask } from '../../shared/multi-repo-workspaces/multi-repo-workspace-contract'
import { folderWorkspaceKey } from '../../shared/workspace-scope'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import {
  killAllProcessesForWorktree,
  type WorktreeTeardownRuntime
} from '../runtime/worktree-teardown'

export async function stopMultiRepoRootForCleanup(
  task: MultiRepoTask,
  runtime: WorktreeTeardownRuntime &
    Pick<OrcaRuntimeService, 'getLocalProvider' | 'onPtyStopped' | 'listFolderWorkspaces'>
): Promise<void> {
  const folder = runtime
    .listFolderWorkspaces()
    .find((entry) => entry.id === task.root.folderWorkspaceId)
  if (
    !folder ||
    folder.folderPath !== task.plan.rootPath ||
    folder.connectionId ||
    (folder.executionHostId && folder.executionHostId !== 'local') ||
    (task.root.projectGroupId && folder.projectGroupId !== task.root.projectGroupId)
  ) {
    throw new Error('Root workspace identity changed; refusing to stop unrelated sessions')
  }
  const provider = runtime.getLocalProvider()
  if (!provider) {
    throw new Error('Local terminal provider is unavailable; root stop cannot be verified')
  }
  const worktreeId = folderWorkspaceKey(folder.id)
  await killAllProcessesForWorktree(worktreeId, {
    runtime,
    resolvedWorktreeId: worktreeId,
    resolvedConnectionId: null,
    verifiedLocalRootPath: task.plan.rootPath,
    localProvider: provider,
    onPtyStopped: runtime.onPtyStopped ?? undefined,
    requirePhysicalStop: true
  })
}
