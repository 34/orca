import type { GitWorktreeInfo } from '../../shared/worktree/types'
import { removeStaleLocalWorktreeRegistration } from '../local-worktree-removal-recovery'
import { cleanupUnusedWorktreePushTargetRemote } from '../ipc/worktree-remote'
import type { RuntimeLocalWorktreeRemovalFinishArgs } from './runtime-registered-local-worktree-removal'

export async function removeRuntimeStaleWorktreeRegistration(
  args: Pick<
    RuntimeLocalWorktreeRemovalFinishArgs,
    | 'repo'
    | 'target'
    | 'localOptions'
    | 'deleteBranch'
    | 'removedPushTarget'
    | 'store'
    | 'finishRemoval'
  > & { registeredWorktree: GitWorktreeInfo; beforeDelete?: () => Promise<void> }
) {
  if (args.beforeDelete) {
    throw new Error('Guarded deletion cannot prune a changed Git registration')
  }
  const result = await removeStaleLocalWorktreeRegistration({
    canonicalWorktreePath: args.registeredWorktree.path,
    repoPath: args.repo.path,
    localWorktreeGitOptions: args.localOptions,
    registeredWorktree: args.registeredWorktree,
    deleteBranch: args.deleteBranch
  })
  await cleanupUnusedWorktreePushTargetRemote(
    args.repo.path,
    args.target.id,
    args.removedPushTarget,
    args.store,
    args.localOptions
  )
  args.finishRemoval(result, true, args.registeredWorktree.head)
  return result ?? {}
}
