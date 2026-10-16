import type { MultiRepoTask } from '../../shared/multi-repo-workspaces/multi-repo-workspace-contract'
import type { Worktree } from '../../shared/worktree/types'
import type { MultiRepoWorkspaceStore } from './multi-repo-workspace-store'

export function recordMultiRepoPreparation(
  task: MultiRepoTask,
  journal: MultiRepoWorkspaceStore,
  worktree: Worktree,
  warning?: string
): MultiRepoTask {
  const member = task.members.find((entry) => entry.repoId === worktree.repoId)
  const plan = task.plan.members.find((entry) => entry.repoId === worktree.repoId)
  if (
    task.root.state !== 'created' ||
    !member ||
    !plan ||
    member.state !== 'creating' ||
    member.setup !== 'pending' ||
    !member.plannedInstanceId ||
    worktree.instanceId !== member.plannedInstanceId ||
    worktree.id !== `${plan.repoId}::${plan.worktreePath}` ||
    worktree.path !== plan.worktreePath ||
    (worktree.hostId && worktree.hostId !== 'local') ||
    worktree.runtimeOwnerEnvironmentId
  ) {
    throw new Error('File preparation receipt does not match the member creation intent')
  }
  member.preparation = { state: 'finished', ...(warning ? { warning } : {}) }
  return journal.save(task, task.revision)
}
