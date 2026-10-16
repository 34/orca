import { reconcileMultiRepoRootRegistration } from './multi-repo-workspace-root-registration'
import type { RuntimeRepositoryCommandSurface } from '../runtime/runtime-repository-command-surface'
import { lstat } from 'node:fs/promises'
import type { Repo } from '../../shared/repo-types'
import type { MultiRepoTask } from '../../shared/multi-repo-workspaces/multi-repo-workspace-contract'
import type { RuntimeStore } from '../runtime/runtime-store-contract'
import type { ProjectRuntimeResolutionStore } from '../local-project-runtime-resolution'
import type { OrcaRuntimeWithRemoveManagedWorktree } from '../runtime/workspaces/workspace-removal'
import type { MultiRepoWorkspaceStore } from './multi-repo-workspace-store'
import { verifyMultiRepoMemberRegistration } from './multi-repo-workspace-member-registration'
import { getStatus } from '../git/status'

export async function removeMultiRepoMember(args: {
  taskId: string
  revision: number
  repoId: string
  journal: MultiRepoWorkspaceStore
  store: ProjectRuntimeResolutionStore &
    Pick<RuntimeStore, 'getWorktreeMeta'> & { getRepo: (id: string) => Repo | undefined }
  runtime: Pick<OrcaRuntimeWithRemoveManagedWorktree, 'removeManagedWorktree'> &
    Pick<RuntimeRepositoryCommandSurface, 'listFolderWorkspaces'>
  stopRootForCleanup: (task: MultiRepoTask) => Promise<void>
}): Promise<MultiRepoTask> {
  const existing = args.journal.get(args.taskId)
  if (!existing) {
    throw new Error('Multi-repo task not found')
  }
  if (existing.revision !== args.revision) {
    throw new Error('Cleanup preview is outdated; refresh it')
  }
  let task = await reconcileMultiRepoRootRegistration({
    task: existing,
    journal: args.journal,
    listFolders: () => args.runtime.listFolderWorkspaces(),
    recover: false
  })
  const member = task.members.find((entry) => entry.repoId === args.repoId)
  const plan = task.plan.members.find((entry) => entry.repoId === args.repoId)
  if (!member || !plan) {
    throw new Error('Member is not part of this task')
  }
  if (member.state === 'removed') {
    return task
  }
  const verify = async (): Promise<void> => {
    const repo = args.store.getRepo(plan.repoId)
    if (
      !repo ||
      !member.instanceId ||
      member.worktreeId !== `${plan.repoId}::${plan.worktreePath}` ||
      !(await verifyMultiRepoMemberRegistration(task, repo, args.store, member.instanceId))
    ) {
      throw new Error('Member identity is unavailable; cleanup is blocked')
    }
    const status = await getStatus(plan.worktreePath, {
      includeIgnored: true,
      includeLineStats: false,
      limit: 200
    })
    if (status.didHitLimit || status.entries.length || status.ignoredPaths?.length) {
      throw new Error(
        'Member contains changed, untracked or ignored files; preserve or move them before cleanup'
      )
    }
    if (args.journal.get(task.taskId)?.revision !== task.revision) {
      throw new Error('Task changed during cleanup')
    }
  }
  await verify()
  member.state = 'removing'
  member.error = undefined
  task = args.journal.save(task, task.revision)
  let verifiedInsideGate = false
  try {
    const result = await args.runtime.removeManagedWorktree(`id:${member.worktreeId}`, {
      hostId: 'local',
      force: false,
      runHooks: true,
      waitForBackgroundRemoval: true,
      beforeDelete: async () => {
        await args.stopRootForCleanup(task)
        await verify()
        verifiedInsideGate = true
      }
    })
    if (!verifiedInsideGate || result.removing) {
      throw new Error('Member deletion completion is not verified')
    }
    const remains = await lstat(plan.worktreePath).then(
      () => true,
      (error: unknown) => {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
          return false
        }
        throw error
      }
    )
    if (remains) {
      throw new Error('Member directory remains after deletion')
    }
    const current = task.members.find((entry) => entry.repoId === args.repoId)!
    current.state = 'removed'
    current.error = undefined
  } catch (error) {
    const current = task.members.find((entry) => entry.repoId === args.repoId)!
    current.state = 'needs-attention'
    current.error = String(error)
  }
  return args.journal.save(task, task.revision)
}
