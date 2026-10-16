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
    throw new Error('成员尚未就绪或已进入清理，无法打开。')
  }
  const refreshed = await useAppStore.getState().fetchWorktrees(repoId, {
    executionHostId: 'local',
    requireAuthoritative: true
  })
  if (!refreshed) {
    throw new Error('无法确认本机成员状态，请刷新后重试。')
  }
  const worktree = useAppStore.getState().getKnownWorktreeById(member.worktreeId, 'local')
  if (
    !worktree ||
    worktree.instanceId !== member.instanceId ||
    worktree.repoId !== repoId ||
    worktree.path !== plan.worktreePath ||
    member.worktreeId !== `${repoId}::${plan.worktreePath}` ||
    (worktree.hostId && worktree.hostId !== 'local') ||
    worktree.runtimeOwnerEnvironmentId ||
    worktree.removing
  ) {
    throw new Error('成员身份已变化或正在清理，请先继续任务核对状态。')
  }
  if (
    !activateAndRevealWorktree(member.worktreeId, {
      executionHostId: 'local',
      navigationIntent: 'user-open',
      agent: null
    })
  ) {
    throw new Error('成员工作区入口不可用，请刷新后重试。')
  }
}
