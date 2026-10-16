import type { MultiRepoRemovalPreview } from '../../shared/multi-repo-workspaces/multi-repo-workspace-removal-preview'
import type {
  MultiRepoSkipSetupRequest,
  MultiRepoRemoveMemberRequest,
  MultiRepoRemoveRootRequest,
  MultiRepoRestoreRootRequest,
  MultiRepoCreateRequest,
  MultiRepoTask,
  MultiRepoWorkspacePlan
} from '../../shared/multi-repo-workspaces/multi-repo-workspace-contract'

export type MultiRepoWorkspacesApi = {
  parentDirectory(): Promise<{ parentPath: string; defaultParentPath?: string }>
  saveParentDirectory(
    request: { source: 'selected'; path: string } | { source: 'default' }
  ): Promise<string>
  skipSetup(request: MultiRepoSkipSetupRequest): Promise<MultiRepoTask>
  previewRemoval(taskId: string): Promise<MultiRepoRemovalPreview>
  stopRootForCleanup(taskId: string): Promise<MultiRepoTask>
  restoreRoot(request: MultiRepoRestoreRootRequest): Promise<MultiRepoTask>
  removeRoot(request: MultiRepoRemoveRootRequest): Promise<MultiRepoTask>
  removeMember(request: MultiRepoRemoveMemberRequest): Promise<MultiRepoTask>
  list(): Promise<MultiRepoTask[]>
  get(taskId: string): Promise<MultiRepoTask | undefined>
  previewCreate(request: MultiRepoCreateRequest): Promise<MultiRepoWorkspacePlan>
  create(request: MultiRepoCreateRequest): Promise<MultiRepoTask>
  continue(taskId: string): Promise<MultiRepoTask>
}
