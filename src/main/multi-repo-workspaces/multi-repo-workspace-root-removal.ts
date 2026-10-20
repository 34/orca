import type { Store } from '../persistence'
import { lstat, readFile, readdir, realpath, rmdir, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { MultiRepoTask } from '../../shared/multi-repo-workspaces/multi-repo-workspace-contract'
import type { MultiRepoWorkspaceStore } from './multi-repo-workspace-store'
import type { RuntimeRepositoryCommandSurface } from '../runtime/runtime-repository-command-surface'
import { reconcileMultiRepoRootRegistration } from './multi-repo-workspace-root-registration'
import { inspectMultiRepoMemberRemoval } from './multi-repo-workspace-member-reconciliation'
import { multiRepoRootFiles } from './multi-repo-workspace-root-files'

type RootRemovalArgs = {
  taskId: string
  revision: number
  journal: MultiRepoWorkspaceStore
  store: Parameters<typeof inspectMultiRepoMemberRemoval>[3] &
    Pick<Store, 'flushPendingOrThrowAsync'> & {
      getRepo: (id: string) => Parameters<typeof inspectMultiRepoMemberRemoval>[2] | undefined
    }
  runtime: Pick<
    RuntimeRepositoryCommandSurface,
    'listFolderWorkspaces' | 'deleteFolderWorkspace'
  > & {
    acquireFileWatcherRemoval: (
      path: string
    ) => Promise<{ finish: (removed: boolean) => Promise<void> }>
  }
  stopRootForCleanup: (task: MultiRepoTask) => Promise<void>
  removeRootSkills?: (task: MultiRepoTask) => Promise<void>
}

export async function removeMultiRepoRoot(args: RootRemovalArgs): Promise<MultiRepoTask> {
  const existing = args.journal.get(args.taskId)
  if (!existing || existing.revision !== args.revision) {
    throw new Error('Cleanup preview is outdated; refresh it')
  }
  let task: MultiRepoTask = existing
  if (task.root.state === 'removed') {
    return task
  }
  if (task.members.some((member) => member.state !== 'removed')) {
    throw new Error('Remove every member before cleaning up the root')
  }
  if (!task.root.cleanupIdentity) {
    task = await reconcileMultiRepoRootRegistration({
      task,
      journal: args.journal,
      listFolders: () => args.runtime.listFolderWorkspaces(),
      recover: false
    })
  }
  if (
    task.root.cleanupIdentity &&
    !args.runtime.listFolderWorkspaces().some((entry) => entry.id === task.root.folderWorkspaceId)
  ) {
    try {
      if (!(await verifiedRootStat(task))) {
        // No filesystem mutation remains, and the deleted entry no longer authorizes a watcher lock.
        await args.store.flushPendingOrThrowAsync()
        task.root.state = 'removed'
        task.root.error = undefined
        return args.journal.save(task, task.revision)
      }
    } catch (error) {
      task.root.error = error instanceof Error ? error.message : String(error)
      return args.journal.save(task, task.revision)
    }
  }
  const gate = await args.runtime.acquireFileWatcherRemoval(task.plan.rootPath)
  let directoryGone = false
  try {
    const stat = await verifiedRootStat(task)
    const folder = args.runtime
      .listFolderWorkspaces()
      .find((entry) => entry.id === task.root.folderWorkspaceId)
    if (folder) {
      await args.stopRootForCleanup(task)
    } else if (stat || !task.root.cleanupIdentity) {
      throw new Error('Root workspace entry is missing; restore it before cleanup')
    }
    if (stat) {
      for (const member of task.members) {
        const repo = args.store.getRepo(member.repoId)
        if (
          !repo ||
          (await inspectMultiRepoMemberRemoval(task, member, repo, args.store)) !== 'removed'
        ) {
          throw new Error('Member removal is not verified; root cleanup is blocked')
        }
      }
      if (!task.root.cleanupIdentity) {
        if (stat.ino === 0n) {
          throw new Error('This filesystem cannot identify the root directory for safe cleanup')
        }
        task.root.cleanupIdentity = { device: String(stat.dev), inode: String(stat.ino) }
        task = args.journal.save(task, task.revision)
      }
      if (task.context?.skillInstallation === 'workspace') {
        if (!args.removeRootSkills) {
          throw new Error('Workspace skill removal is unavailable')
        }
        await args.removeRootSkills(task)
      }
      await cleanupGeneratedRootFiles(task)
    }
    directoryGone = true
    if (folder) {
      await args.runtime.deleteFolderWorkspace(folder.id)
      if (args.runtime.listFolderWorkspaces().some((entry) => entry.id === folder.id)) {
        throw new Error(
          'Root directory was removed but workspace registration remains; retry cleanup'
        )
      }
    }
    await args.store.flushPendingOrThrowAsync()
    task.root.state = 'removed'
    task.root.error = undefined
  } catch (error) {
    task.root.error = error instanceof Error ? error.message : String(error)
  } finally {
    await gate.finish(directoryGone)
  }
  return args.journal.save(task, task.revision)
}

async function verifiedRootStat(task: MultiRepoTask) {
  const root = task.plan.rootPath
  if (
    dirname(root) !== task.plan.parentPath ||
    (await realpath(task.plan.parentPath)) !== task.plan.parentPath
  ) {
    throw new Error('Multi-repo parent directory changed')
  }
  const stat = await lstat(root, { bigint: true }).catch((error: unknown) => {
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'ENOENT' &&
      task.root.cleanupIdentity
    ) {
      return undefined
    }
    throw error
  })
  if (
    stat &&
    (!stat.isDirectory() ||
      (await realpath(root)) !== root ||
      (task.root.cleanupIdentity &&
        (String(stat.dev) !== task.root.cleanupIdentity.device ||
          String(stat.ino) !== task.root.cleanupIdentity.inode)))
  ) {
    throw new Error('Multi-repo root was replaced or moved; cleanup is blocked')
  }
  return stat
}

async function cleanupGeneratedRootFiles(task: MultiRepoTask): Promise<void> {
  const generated = multiRepoRootFiles(task)
  const marker = '.orca-multi-repo.json'
  // The marker is removed last, so retained notes keep their task ownership evidence.
  for (const name of Object.keys(generated).filter((entry) => entry !== marker)) {
    await verifiedRootStat(task)
    await unlinkUnchangedGeneratedFile(task, name, generated[name])
  }
  await verifiedRootStat(task)
  if ((await readdir(task.plan.rootPath)).some((name) => name !== marker)) {
    throw new Error('Root contains retained files; move them before completing cleanup')
  }
  await unlinkUnchangedGeneratedFile(task, marker, generated[marker])
  await verifiedRootStat(task)
  await rmdir(task.plan.rootPath)
}

async function unlinkUnchangedGeneratedFile(
  task: MultiRepoTask,
  name: string,
  expected: string | Buffer
): Promise<void> {
  const path = join(task.plan.rootPath, name)
  const stat = await lstat(path).catch((error: unknown) => {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return undefined
    }
    throw error
  })
  if (stat?.isFile() && (await readFile(path)).equals(Buffer.from(expected))) {
    await unlink(path)
  }
}

export async function stopRegisteredMultiRepoRoot(
  args: Pick<RootRemovalArgs, 'taskId' | 'journal' | 'stopRootForCleanup'> & {
    runtime: Pick<RuntimeRepositoryCommandSurface, 'listFolderWorkspaces'>
  }
): Promise<MultiRepoTask> {
  const existing = args.journal.get(args.taskId)
  if (!existing) {
    throw new Error('Multi-repo task not found')
  }
  const task = await reconcileMultiRepoRootRegistration({
    task: existing,
    journal: args.journal,
    listFolders: () => args.runtime.listFolderWorkspaces(),
    recover: false
  })
  await args.stopRootForCleanup(task)
  return task
}
