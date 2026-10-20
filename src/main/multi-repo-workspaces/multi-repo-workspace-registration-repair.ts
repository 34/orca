import { lstat, realpath } from 'node:fs/promises'
import type { Repo } from '../../shared/repo-types'
import type { MultiRepoTask } from '../../shared/multi-repo-workspaces/multi-repo-workspace-contract'
import { getProjectHostSetupWorktreeMeta } from '../../shared/project-host-setup-lookup'
import type { RuntimeStore } from '../runtime/runtime-store-contract'
import type { ProjectRuntimeResolutionStore } from '../local-project-runtime-resolution'
import { readRepoCommonDirFromGit, readWorktreeHeadOid } from '../git/worktree-list-reader'
import { worktreeCreateGit } from '../git/worktree-create-git-executor'
import { findPendingWorktreeRemovalConflict } from '../worktree-removal-table'
import { assertMultiRepoPlacementHost } from './multi-repo-workspace-placement'
import { verifyMultiRepoWorkspaceIdentity } from './multi-repo-workspace-identity'
import { verifyMultiRepoRootOwnership } from './multi-repo-workspace-root-registration'
import type { MultiRepoWorkspaceStore } from './multi-repo-workspace-store'
import { hostWorktreeTargetForRepo } from '../persistence/host-qualified-worktree-meta'

export async function repairMultiRepoMemberRegistration(args: {
  task: MultiRepoTask
  member: MultiRepoTask['members'][number]
  repo: Repo
  store: ProjectRuntimeResolutionStore &
    Pick<RuntimeStore, 'getWorktreeMeta' | 'setWorktreeMeta' | 'getProjectHostSetups'>
  journal: MultiRepoWorkspaceStore
}): Promise<void> {
  await worktreeCreateGit.run(async () => {
    const { task, member, repo, store, journal } = args
    const plan = task.plan.members.find((entry) => entry.repoId === repo.id)
    if (
      !plan ||
      member.repoId !== repo.id ||
      !member.plannedInstanceId ||
      member.worktreeId ||
      member.instanceId ||
      member.setup !== 'pending' ||
      (member.state !== 'creating' && member.state !== 'needs-attention')
    ) {
      throw new Error('Missing interrupted member creation intent')
    }
    const worktreeId = `${repo.id}::${plan.worktreePath}`
    if (store.getWorktreeMeta(worktreeId)) {
      return
    }
    const exists = await lstat(plan.worktreePath).then(
      () => true,
      (error: unknown) => {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
          return false
        }
        throw error
      }
    )
    if (!exists) {
      return
    }
    assertMultiRepoPlacementHost(store, repo)
    await verifyMultiRepoRootOwnership(task)
    const common = await readRepoCommonDirFromGit(repo.path)
    if (repo.path !== plan.repoPath || !common || (await realpath(common)) !== plan.commonDir) {
      throw new Error('Multi-repo source Git identity changed')
    }
    await verifyMultiRepoWorkspaceIdentity({ ...task.plan, members: [plan] })
    if ((await readWorktreeHeadOid(plan.worktreePath)) !== plan.baseCommit) {
      throw new Error('Unregistered member no longer matches its planned starting commit')
    }
    assertMultiRepoPlacementHost(store, repo)
    if (
      journal.get(task.taskId)?.revision !== task.revision ||
      store.getWorktreeMeta(worktreeId) ||
      findPendingWorktreeRemovalConflict(repo.path, { worktreePath: plan.worktreePath })
    ) {
      throw new Error('Member ownership changed during registration recovery')
    }
    const now = Date.now()
    store.setWorktreeMeta(hostWorktreeTargetForRepo(worktreeId, repo), {
      ...getProjectHostSetupWorktreeMeta(store.getProjectHostSetups?.() ?? [], repo),
      instanceId: member.plannedInstanceId,
      lastActivityAt: now,
      createdAt: now,
      orcaCreatedAt: now,
      orcaCreationSource: 'runtime',
      creatorProvenance: { kind: 'host' },
      baseRef: plan.baseRef,
      preserveBranchOnDelete: true,
      orcaCreationWorkspaceLayout: { path: task.plan.rootPath, nestWorkspaces: false }
    })
  })
}
