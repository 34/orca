import { lstat, readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { MultiRepoTask } from '../../shared/multi-repo-workspaces/multi-repo-workspace-contract'
import type { MultiRepoRemovalPreview } from '../../shared/multi-repo-workspaces/multi-repo-workspace-removal-preview'
import type { Repo } from '../../shared/repo-types'
import type { RuntimeStore } from '../runtime/runtime-store-contract'
import type { ProjectRuntimeResolutionStore } from '../local-project-runtime-resolution'
import { getStatus } from '../git/status'
import { verifyMultiRepoMemberRegistration } from './multi-repo-workspace-member-registration'
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
        (await readFile(path, 'utf8')) === generated[name]
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
      if (
        !repo ||
        !state?.instanceId ||
        state.worktreeId !== `${plan.repoId}::${plan.worktreePath}` ||
        !(await verifyMultiRepoMemberRegistration(task, repo, store, state.instanceId))
      ) {
        throw new Error('Member registration is missing or changed; cleanup is blocked')
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
