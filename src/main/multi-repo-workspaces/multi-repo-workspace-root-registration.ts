import { lstat, readFile, realpath } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import type { FolderWorkspace } from '../../shared/folder-workspace-types'
import type { MultiRepoTask } from '../../shared/multi-repo-workspaces/multi-repo-workspace-contract'
import type { MultiRepoWorkspaceStore } from './multi-repo-workspace-store'

export async function reconcileMultiRepoRootRegistration(args: {
  task: MultiRepoTask
  journal: MultiRepoWorkspaceStore
  listFolders: () => FolderWorkspace[]
  recover: boolean
}): Promise<MultiRepoTask> {
  const { task } = args
  if (
    task.root.state !== 'created' ||
    (!task.root.folderWorkspaceId && !task.root.folderRegistration)
  ) {
    return task
  }
  try {
    const path = task.plan.rootPath
    await verifyMultiRepoRootOwnership(task)
    if (!task.root.folderWorkspaceId) {
      if (!args.recover || !task.root.projectGroupId) {
        throw new Error('Recover the root folder registration before retrying')
      }
      const matches = args
        .listFolders()
        .filter(
          (folder) =>
            folder.folderPath === path &&
            folder.projectGroupId === task.root.projectGroupId &&
            !folder.connectionId &&
            (!folder.executionHostId || folder.executionHostId === 'local')
        )
      if (matches.length !== 1) {
        throw new Error(
          'Multi-repo root registration is missing or ambiguous; restore it explicitly'
        )
      }
      task.root.folderWorkspaceId = matches[0].id
      task.root.folderRegistration = 'registered'
    }
    const folder = args.listFolders().find((entry) => entry.id === task.root.folderWorkspaceId)
    if (
      !folder ||
      folder.folderPath !== path ||
      folder.connectionId ||
      (folder.executionHostId && folder.executionHostId !== 'local') ||
      (task.root.projectGroupId && folder.projectGroupId !== task.root.projectGroupId)
    ) {
      throw new Error('Multi-repo root entry was removed or changed; restore it explicitly')
    }
    task.root.error = undefined
    return args.journal.save(task, task.revision)
  } catch (error) {
    task.root.error = error instanceof Error ? error.message : String(error)
    args.journal.save(task, task.revision)
    throw error
  }
}

export async function verifyMultiRepoRootOwnership(task: MultiRepoTask): Promise<void> {
  const path = task.plan.rootPath
  if (
    dirname(path) !== task.plan.parentPath ||
    (await realpath(task.plan.parentPath)) !== task.plan.parentPath ||
    (await realpath(path)) !== path ||
    !(await lstat(path)).isDirectory()
  ) {
    throw new Error('Multi-repo root was replaced or moved')
  }
  const marker = join(path, '.orca-multi-repo.json')
  if (
    !(await lstat(marker)).isFile() ||
    !isDeepStrictEqual(JSON.parse(await readFile(marker, 'utf8')), {
      schemaVersion: 1,
      taskId: task.taskId,
      members: task.plan.members
    })
  ) {
    throw new Error('Multi-repo root ownership marker changed')
  }
}
