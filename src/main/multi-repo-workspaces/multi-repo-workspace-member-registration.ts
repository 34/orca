import { composeWorktreeId } from '../../shared/worktree/id'
import { repairMultiRepoMemberRegistration } from './multi-repo-workspace-registration-repair'
import type { MultiRepoWorkspaceStore } from './multi-repo-workspace-store'
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
  store: ProjectRuntimeResolutionStore &
    Pick<RuntimeStore, 'getWorktreeMeta' | 'setWorktreeMeta' | 'getProjectHostSetups'>,
  journal: MultiRepoWorkspaceStore
): Promise<boolean> {
  if (!member.plannedInstanceId) {
    return false
  }
  await repairMultiRepoMemberRegistration({ task, member, repo, store, journal })
  const registration = await verifyMultiRepoMemberRegistration(
    task,
    repo,
    store,
    member.plannedInstanceId
  )
  if (!registration) {
    return false
  }
  member.worktreeId = registration.worktreeId
  member.instanceId = registration.instanceId
  member.state = 'registered'
  member.error =
    'Worktree registration recovered; file preparation and setup completion need review'
  return true
}

export async function verifyMultiRepoMemberRegistration(
  task: MultiRepoTask,
  repo: Repo,
  store: ProjectRuntimeResolutionStore & Pick<RuntimeStore, 'getWorktreeMeta'>,
  instanceId: string
): Promise<{ worktreeId: string; instanceId: string } | undefined> {
  const registration = await verifyMultiRepoMemberMetadata(task, repo, store, instanceId)
  const plan = task.plan.members.find((entry) => entry.repoId === repo.id)
  if (registration && plan) {
    await verifyMultiRepoWorkspaceIdentity({ ...task.plan, members: [plan] })
  }
  return registration
}

export async function verifyMultiRepoMemberMetadata(
  task: MultiRepoTask,
  repo: Repo,
  store: ProjectRuntimeResolutionStore & Pick<RuntimeStore, 'getWorktreeMeta'>,
  instanceId: string
): Promise<{ worktreeId: string; instanceId: string } | undefined> {
  const plan = task.plan.members.find((entry) => entry.repoId === repo.id)
  if (!plan || !instanceId) {
    return undefined
  }
  const worktreeId = composeWorktreeId(repo.id, plan.worktreePath)
  const meta = store.getWorktreeMeta(worktreeId)
  if (!meta) {
    return undefined
  }
  assertMultiRepoPlacementHost(store, repo)
  if (
    meta.instanceId !== instanceId ||
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
  return { worktreeId, instanceId }
}
