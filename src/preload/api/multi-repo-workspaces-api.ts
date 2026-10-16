import type { MultiRepoRemovalPreview } from '../../shared/multi-repo-workspaces/multi-repo-workspace-removal-preview'
import type {
  MultiRepoCreateRequest,
  MultiRepoTask
} from '../../shared/multi-repo-workspaces/multi-repo-workspace-contract'

export type MultiRepoWorkspacesApi = {
  previewRemoval(taskId: string): Promise<MultiRepoRemovalPreview>
  list(): Promise<MultiRepoTask[]>
  get(taskId: string): Promise<MultiRepoTask | undefined>
  create(request: MultiRepoCreateRequest): Promise<MultiRepoTask>
  continue(taskId: string): Promise<MultiRepoTask>
}
