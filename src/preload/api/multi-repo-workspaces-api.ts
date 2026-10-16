import type { MultiRepoRemovalPreview } from '../../shared/multi-repo-workspaces/multi-repo-workspace-removal-preview'
import type {
  MultiRepoRemoveMemberRequest,
  MultiRepoRemoveRootRequest,
  MultiRepoRestoreRootRequest,
  MultiRepoCreateRequest,
  MultiRepoTask
} from '../../shared/multi-repo-workspaces/multi-repo-workspace-contract'

export type MultiRepoWorkspacesApi = {
  previewRemoval(taskId: string): Promise<MultiRepoRemovalPreview>
  stopRootForCleanup(taskId: string): Promise<MultiRepoTask>
  restoreRoot(request: MultiRepoRestoreRootRequest): Promise<MultiRepoTask>
  removeRoot(request: MultiRepoRemoveRootRequest): Promise<MultiRepoTask>
  removeMember(request: MultiRepoRemoveMemberRequest): Promise<MultiRepoTask>
  list(): Promise<MultiRepoTask[]>
  get(taskId: string): Promise<MultiRepoTask | undefined>
  create(request: MultiRepoCreateRequest): Promise<MultiRepoTask>
  continue(taskId: string): Promise<MultiRepoTask>
}
