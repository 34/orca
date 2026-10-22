import {
  recoverMultiRepoMemberLineage,
  type MultiRepoLineageStore
} from './multi-repo-workspace-lineage-recovery'
import { reconcileMultiRepoMember } from './multi-repo-workspace-member-reconciliation'
import type { Repo } from '../../shared/repo-types'
import type { RuntimeStore } from '../runtime/runtime-store-contract'
import {
  recoverMultiRepoMemberRegistration,
  verifyMultiRepoMemberRegistration
} from './multi-repo-workspace-member-registration'
import type { MultiRepoTask } from '../../shared/multi-repo-workspaces/multi-repo-workspace-contract'
import type { ProjectRuntimeResolutionStore } from '../local-project-runtime-resolution'
import { resolveMultiRepoPlacement } from './multi-repo-workspace-placement'
import type { MultiRepoWorkspaceStore } from './multi-repo-workspace-store'

export async function recoverMultiRepoMembers(args: {
  task: MultiRepoTask
  journal: MultiRepoWorkspaceStore
  store: ProjectRuntimeResolutionStore &
    MultiRepoLineageStore &
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
        if (
          member.setup === 'pending' &&
          (member.state === 'registered' || member.state === 'needs-attention')
        ) {
          const registration = await verifyMultiRepoMemberRegistration(
            task,
            repo,
            args.store,
            member.instanceId ?? ''
          )
          if (!registration) {
            throw new Error('Member registration is missing before lineage recovery')
          }
          recoverMultiRepoMemberLineage(task, member, args.store)
          member.state = 'registered'
          member.error =
            'Worktree registration recovered; file preparation and setup completion need review'
        }
        continue
      }
      if (member.state !== 'creating' && member.state !== 'needs-attention') {
        throw new Error('Member registration identity is missing; review the task')
      }
      if (member.setup !== 'pending') {
        continue
      }
      if (await recoverMultiRepoMemberRegistration(task, member, repo, args.store, args.journal)) {
        recoverMultiRepoMemberLineage(task, member, args.store)
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
