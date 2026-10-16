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
    Pick<RuntimeStore, 'getWorktreeMeta'> & { getRepo: (id: string) => Repo | undefined }
}): Promise<MultiRepoTask> {
  let { task } = args
  if (task.root.state !== 'created' || !task.root.folderWorkspaceId) {
    return task
  }
  for (const member of task.members) {
    if (member.state !== 'creating' && member.state !== 'needs-attention') {
      continue
    }
    // Recorded registrations need reconciliation, even if somebody removed their files.
    if (member.worktreeId || member.instanceId || member.setup !== 'pending') {
      continue
    }
    try {
      const repo = args.store.getRepo(member.repoId)
      if (!repo) {
        throw new Error('Multi-repo source repository is no longer registered')
      }
      if (await recoverMultiRepoMemberRegistration(task, member, repo, args.store)) {
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
