import { reconcileMultiRepoMember } from './multi-repo-workspace-member-reconciliation'
import type { Repo } from '../../shared/repo-types'
import type { RuntimeStore } from '../runtime/runtime-store-contract'
import { recoverMultiRepoMemberRegistration } from './multi-repo-workspace-member-registration'
import type { MultiRepoTask } from '../../shared/multi-repo-workspaces/multi-repo-workspace-contract'
import type { ProjectRuntimeResolutionStore } from '../local-project-runtime-resolution'
import { resolveMultiRepoPlacement } from './multi-repo-workspace-placement'
import type { MultiRepoWorkspaceStore } from './multi-repo-workspace-store'

export async function recoverMultiRepoMembers(args: {
  task: MultiRepoTask
  journal: MultiRepoWorkspaceStore
  store: ProjectRuntimeResolutionStore &
    Pick<RuntimeStore, 'getWorktreeMeta' | 'setWorktreeMeta' | 'getProjectHostSetups'> & {
      getRepo: (id: string) => Repo | undefined
    }
}): Promise<MultiRepoTask> {
  let { task } = args
  if (task.root.state !== 'created' || !task.root.folderWorkspaceId) {
    return task
  }
  for (const member of task.members) {
    if (member.state === 'removed' || member.state === 'planned') {
      continue
    }
    try {
      const repo = args.store.getRepo(member.repoId)
      if (!repo) {
        throw new Error('Multi-repo source repository is no longer registered')
      }
      if (member.worktreeId || member.instanceId) {
        await reconcileMultiRepoMember(task, member, repo, args.store)
        continue
      }
      if (member.state !== 'creating' && member.state !== 'needs-attention') {
        throw new Error('Member registration identity is missing; review the task')
      }
      if (member.setup !== 'pending') {
        continue
      }
      if (await recoverMultiRepoMemberRegistration(task, member, repo, args.store, args.journal)) {
        continue
      }
      await resolveMultiRepoPlacement(
        args.store,
        repo,
        { taskId: task.taskId, repoId: member.repoId },
        member.state
      )
      member.state = 'planned'
      member.error = undefined
    } catch (error) {
      member.state = 'needs-attention'
      member.error = error instanceof Error ? error.message : String(error)
    }
  }
  task = args.journal.save(task, task.revision)
  return task
}
