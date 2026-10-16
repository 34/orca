import type {
  MultiRepoCreateRequest,
  MultiRepoTask
} from '../../shared/multi-repo-workspaces/multi-repo-workspace-contract'

export type MultiRepoWorkspacesApi = {
  list(): Promise<MultiRepoTask[]>
  get(taskId: string): Promise<MultiRepoTask | undefined>
  create(request: MultiRepoCreateRequest): Promise<MultiRepoTask>
  continue(taskId: string): Promise<MultiRepoTask>
}
