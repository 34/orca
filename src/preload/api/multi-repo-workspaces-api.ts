import type { MultiRepoRemovalPreview } from '../../shared/multi-repo-workspaces/multi-repo-workspace-removal-preview'
import type {
  MultiRepoRemoveMemberRequest,
  MultiRepoCreateRequest,
  MultiRepoTask
} from '../../shared/multi-repo-workspaces/multi-repo-workspace-contract'

export type MultiRepoWorkspacesApi = {
  previewRemoval(taskId: string): Promise<MultiRepoRemovalPreview>
  stopRootForCleanup(taskId: string): Promise<MultiRepoTask>
  removeMember(request: MultiRepoRemoveMemberRequest): Promise<MultiRepoTask>
  list(): Promise<MultiRepoTask[]>
  get(taskId: string): Promise<MultiRepoTask | undefined>
  create(request: MultiRepoCreateRequest): Promise<MultiRepoTask>
  continue(taskId: string): Promise<MultiRepoTask>
}
