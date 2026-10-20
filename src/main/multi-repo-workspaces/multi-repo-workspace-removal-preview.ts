import type { MultiRepoWorkspaceServiceDependencies } from './multi-repo-workspace-service-contract'
import { lstat, readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { MultiRepoTask } from '../../shared/multi-repo-workspaces/multi-repo-workspace-contract'
import type { MultiRepoRemovalPreview } from '../../shared/multi-repo-workspaces/multi-repo-workspace-removal-preview'
import type { Repo } from '../../shared/repo-types'
import type { RuntimeStore } from '../runtime/runtime-store-contract'
import type { ProjectRuntimeResolutionStore } from '../local-project-runtime-resolution'
import { getStatus } from '../git/status'
import { inspectMultiRepoMemberRemoval } from './multi-repo-workspace-member-reconciliation'
import { verifyMultiRepoWorkspaceIdentity } from './multi-repo-workspace-identity'
import { multiRepoRootFiles } from './multi-repo-workspace-root-files'

export async function previewMultiRepoRemoval(
  task: MultiRepoTask,
  store: ProjectRuntimeResolutionStore &
    Pick<RuntimeStore, 'getWorktreeMeta'> & {
      getRepo: (id: string) => Repo | undefined
    }
): Promise<MultiRepoRemovalPreview> {
  const preview: MultiRepoRemovalPreview = {
    taskId: task.taskId,
    revision: task.revision,
    rootPath: task.plan.rootPath,
    removableRootFiles: [],
    retainedRootEntries: [],
    members: []
  }
  try {
    await verifyMultiRepoWorkspaceIdentity({ ...task.plan, members: [] })
    const generated = multiRepoRootFiles(task)
    for (const name of await readdir(task.plan.rootPath)) {
      if (task.plan.members.some((member) => member.directoryName === name)) {
        continue
      }
      const path = join(task.plan.rootPath, name)
      if (
        Object.hasOwn(generated, name) &&
        (await lstat(path)).isFile() &&
        (await readFile(path)).equals(Buffer.from(generated[name]))
      ) {
        preview.removableRootFiles.push(name)
      } else {
        preview.retainedRootEntries.push(name)
      }
    }
  } catch (error) {
    preview.rootError = String(error)
  }
  for (const plan of task.plan.members) {
    const member: MultiRepoRemovalPreview['members'][number] = {
      repoId: plan.repoId,
      path: plan.worktreePath,
      branch: plan.branchName,
      preserveBranch: true,
      changedPaths: [],
      ignoredPaths: [],
      truncated: false
    }
    preview.members.push(member)
    try {
      const state = task.members.find((entry) => entry.repoId === plan.repoId)
      if (state?.state === 'removed') {
        member.removed = true
        continue
      }
      const repo = store.getRepo(plan.repoId)
      if (!repo || !state) {
        throw new Error('Member registration is missing or changed; cleanup is blocked')
      }
      const observed = await inspectMultiRepoMemberRemoval(task, state, repo, store)
      if (observed === 'removed') {
        throw new Error('Member was already removed; continue the task to reconcile it')
      }
      if (observed === 'registration-only') {
        continue
      }
      const status = await getStatus(plan.worktreePath, {
        includeIgnored: true,
        includeLineStats: false,
        limit: 200
      })
      member.changedPaths = status.entries.map((entry) => entry.path)
      member.ignoredPaths = status.ignoredPaths ?? []
      member.truncated = status.didHitLimit === true
    } catch (error) {
      member.error = String(error)
    }
  }
  return preview
}

export async function previewMultiRepoTaskRemoval(
  deps: MultiRepoWorkspaceServiceDependencies,
  taskId: string,
  unavailable: () => boolean
) {
  if (unavailable()) {
    throw new Error('Wait for the active multi-repo operation before previewing cleanup')
  }
  const task = deps.journal.get(taskId)
  if (!task) {
    throw new Error('Multi-repo task not found')
  }
  const preview = await previewMultiRepoRemoval(task, deps.store)
  if (unavailable() || deps.journal.get(taskId)?.revision !== task.revision) {
    throw new Error('Task changed during cleanup preview; refresh the preview')
  }
  return preview
}
