import { realpath } from 'node:fs/promises'
import type { MultiRepoTask } from '../../shared/multi-repo-workspaces/multi-repo-workspace-contract'
import type { Repo } from '../../shared/repo-types'
import type { RuntimeStore } from '../runtime/runtime-store-contract'
import type { ProjectRuntimeResolutionStore } from '../local-project-runtime-resolution'
import { readRepoCommonDirFromGit } from '../git/worktree-list-reader'
import { assertMultiRepoPlacementHost } from './multi-repo-workspace-placement'
import { verifyMultiRepoWorkspaceIdentity } from './multi-repo-workspace-identity'

export async function recoverMultiRepoMemberRegistration(
  task: MultiRepoTask,
  member: MultiRepoTask['members'][number],
  repo: Repo,
  store: ProjectRuntimeResolutionStore & Pick<RuntimeStore, 'getWorktreeMeta'>
): Promise<boolean> {
  const plan = task.plan.members.find((entry) => entry.repoId === member.repoId)
  if (!plan || !member.plannedInstanceId) {
    return false
  }
  const worktreeId = `${member.repoId}::${plan.worktreePath}`
  const meta = store.getWorktreeMeta(worktreeId)
  if (!meta) {
    return false
  }
  assertMultiRepoPlacementHost(store, repo)
  if (
    meta.instanceId !== member.plannedInstanceId ||
    meta.preserveBranchOnDelete !== true ||
    meta.orcaCreationWorkspaceLayout?.path !== task.plan.rootPath ||
    meta.orcaCreationWorkspaceLayout.nestWorkspaces !== false ||
    (meta.hostId && meta.hostId !== 'local') ||
    repo.path !== plan.repoPath
  ) {
    throw new Error('Multi-repo member registration does not match its creation intent')
  }
  const common = await readRepoCommonDirFromGit(repo.path)
  if (!common || (await realpath(common)) !== plan.commonDir) {
    throw new Error('Multi-repo source Git identity changed')
  }
  await verifyMultiRepoWorkspaceIdentity({ ...task.plan, members: [plan] })
  member.worktreeId = worktreeId
  member.instanceId = meta.instanceId
  member.state = 'registered'
  member.error =
    'Worktree registration recovered; file preparation and setup completion need review'
  return true
}
