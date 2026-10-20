import { composeWorktreeId } from '../../shared/worktree/id'
import { dirname, join } from 'node:path'
import { lstat, realpath } from 'node:fs/promises'
import type { MultiRepoTask } from '../../shared/multi-repo-workspaces/multi-repo-workspace-contract'
import type { Repo } from '../../shared/repo-types'
import type { RuntimeStore } from '../runtime/runtime-store-contract'
import type { ProjectRuntimeResolutionStore } from '../local-project-runtime-resolution'
import { areWorktreePathsEqual } from '../git/worktree-path-comparison'
import { listWorktreesStrict } from '../git/worktree-listing'
import { readRepoCommonDirFromGit } from '../git/worktree-list-reader'
import { assertMultiRepoPlacementHost } from './multi-repo-workspace-placement'
import { verifyMultiRepoWorkspaceIdentity } from './multi-repo-workspace-identity'
import {
  verifyMultiRepoMemberMetadata,
  verifyMultiRepoMemberRegistration
} from './multi-repo-workspace-member-registration'

export async function inspectMultiRepoMemberRemoval(
  task: MultiRepoTask,
  member: MultiRepoTask['members'][number],
  repo: Repo,
  store: ProjectRuntimeResolutionStore & Pick<RuntimeStore, 'getWorktreeMeta'>
): Promise<'present' | 'registration-only' | 'removed'> {
  const plan = task.plan.members.find((entry) => entry.repoId === member.repoId)
  if (
    !plan ||
    !member.instanceId ||
    member.worktreeId !== composeWorktreeId(repo.id, plan.worktreePath) ||
    dirname(plan.worktreePath) !== task.plan.rootPath ||
    plan.worktreePath !== join(task.plan.rootPath, plan.directoryName)
  ) {
    throw new Error('Member identity is unavailable; reconciliation is blocked')
  }
  assertMultiRepoPlacementHost(store, repo)
  await verifyMultiRepoWorkspaceIdentity({ ...task.plan, members: [] })
  const common = await readRepoCommonDirFromGit(repo.path)
  if (repo.path !== plan.repoPath || !common || (await realpath(common)) !== plan.commonDir) {
    throw new Error('Multi-repo source Git identity changed')
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
  if (exists) {
    if (!(await verifyMultiRepoMemberRegistration(task, repo, store, member.instanceId))) {
      throw new Error('Member files remain without matching registration; preserve them for review')
    }
    return 'present'
  }
  const worktrees = await listWorktreesStrict(repo.path, { includeCreatePreparations: true })
  if (
    worktrees.some(
      (entry) =>
        areWorktreePathsEqual(entry.path, plan.worktreePath) ||
        entry.branch === `refs/heads/${plan.branchName}`
    )
  ) {
    throw new Error('Member Git registration remains or moved; reconciliation is blocked')
  }
  if (store.getWorktreeMeta(member.worktreeId)) {
    await verifyMultiRepoMemberMetadata(task, repo, store, member.instanceId)
    return 'registration-only'
  }
  return 'removed'
}

export async function reconcileMultiRepoMember(
  ...args: Parameters<typeof inspectMultiRepoMemberRemoval>
): Promise<void> {
  const state = await inspectMultiRepoMemberRemoval(...args)
  const member = args[1]
  if (state === 'removed') {
    member.state = 'removed'
    member.error = undefined
  } else if (state === 'registration-only' || member.state === 'removing') {
    member.state = 'needs-attention'
    member.error = 'Deletion was interrupted; refresh the cleanup preview and confirm again'
  }
}
