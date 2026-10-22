import { composeWorktreeId } from '../../../../shared/worktree/id'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import type { MultiRepoTask } from '../../../../shared/multi-repo-workspaces/multi-repo-workspace-contract'

export async function openMultiRepoMember(task: MultiRepoTask, repoId: string): Promise<void> {
  const member = task.members.find((entry) => entry.repoId === repoId)
  const plan = task.plan.members.find((entry) => entry.repoId === repoId)
  if (
    !member?.worktreeId ||
    !member.instanceId ||
    !plan ||
    (member.state !== 'ready' && member.state !== 'registered')
  ) {
    throw new Error(
      translate(
        'multiRepoWorkspaces.memberNotReady',
        'The member is not ready or has entered cleanup and cannot be opened.'
      )
    )
  }
  const refreshed = await useAppStore.getState().fetchWorktrees(repoId, {
    executionHostId: 'local',
    requireAuthoritative: true
  })
  if (!refreshed) {
    throw new Error(
      translate(
        'multiRepoWorkspaces.memberUnverifiable',
        'Cannot verify the local member state. Refresh and try again.'
      )
    )
  }
  const worktree = useAppStore.getState().getKnownWorktreeById(member.worktreeId, 'local')
  if (
    !worktree ||
    worktree.instanceId !== member.instanceId ||
    worktree.repoId !== repoId ||
    worktree.path !== plan.worktreePath ||
    member.worktreeId !== composeWorktreeId(repoId, plan.worktreePath) ||
    (worktree.hostId && worktree.hostId !== 'local') ||
    worktree.runtimeOwnerEnvironmentId ||
    worktree.removing
  ) {
    throw new Error(
      translate(
        'multiRepoWorkspaces.memberChanged',
        'The member identity changed or cleanup is in progress. Continue the task to reconcile its state first.'
      )
    )
  }
  if (
    !activateAndRevealWorktree(member.worktreeId, {
      executionHostId: 'local',
      navigationIntent: 'user-open',
      agent: null
    })
  ) {
    throw new Error(
      translate(
        'multiRepoWorkspaces.memberUnavailable',
        'The member workspace entry is unavailable. Refresh and try again.'
      )
    )
  }
}
