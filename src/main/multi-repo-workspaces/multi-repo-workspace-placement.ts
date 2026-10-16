import { lstat, realpath } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import type { Repo } from '../../shared/repo-types'
import { getRepoExecutionHostId } from '../../shared/execution-host'
import { isWslUncPath } from '../../shared/wsl-paths'
import { getLocalProjectGitExecOptions } from '../project-runtime-git-options'
import type { ProjectRuntimeResolutionStore } from '../local-project-runtime-resolution'
import { readRepoCommonDirFromGit } from '../git/worktree-list-reader'
import { getBranchConflictKind } from '../git/repo-branch-conflict'
import { findPendingWorktreeRemovalConflict } from '../worktree-removal-table'
import type { MultiRepoWorkspaceStore } from './multi-repo-workspace-store'
import { verifyMultiRepoWorkspaceIdentity } from './multi-repo-workspace-identity'

export type MultiRepoPlacement = { taskId: string; repoId: string }
const owners = new WeakMap<object, MultiRepoWorkspaceStore>()

export async function resolveMultiRepoWritableDirectories(
  store: object,
  workspaceId: string,
  cwd: string
): Promise<string[]> {
  const journal = owners.get(store)
  if (!journal || !workspaceId.startsWith('folder:')) {
    return []
  }
  const tasks = journal
    .list()
    .filter((task) => `folder:${task.root.folderWorkspaceId}` === workspaceId)
  if (tasks.length === 0) {
    return []
  }
  const [task] = tasks
  if (
    tasks.length !== 1 ||
    task.plan.rootPath !== cwd ||
    task.root.state !== 'created' ||
    task.members.some((member) => member.state !== 'ready')
  ) {
    throw new Error('Multi-repo workspace is not ready for member permissions')
  }
  await verifyMultiRepoWorkspaceIdentity(task.plan)
  if (owners.get(store) !== journal || journal.get(task.taskId)?.revision !== task.revision) {
    throw new Error('Multi-repo permission intent changed during validation')
  }
  return [...new Set(task.plan.members.map((member) => member.commonDir))]
}

export function bindMultiRepoWorkspaceOwner(
  runtimeStore: object,
  journal: MultiRepoWorkspaceStore
): () => void {
  if (owners.has(runtimeStore)) {
    throw new Error('Multi-repo profile already has an execution owner')
  }
  owners.set(runtimeStore, journal)
  return () => {
    if (owners.get(runtimeStore) === journal) {
      owners.delete(runtimeStore)
    }
    journal.close()
  }
}

export function assertMultiRepoPlacementHost(
  store: ProjectRuntimeResolutionStore,
  repo: Repo
): void {
  if (!owners.has(store)) {
    throw new Error('Multi-repo execution owner is unavailable')
  }
  if (
    repo.kind === 'folder' ||
    getRepoExecutionHostId(repo) !== 'local' ||
    isWslUncPath(repo.path) ||
    getLocalProjectGitExecOptions(store, repo).wslDistro
  ) {
    throw new Error('Multi-repo placement requires a native-local Git repository')
  }
}

export async function resolveMultiRepoPlacement(
  store: ProjectRuntimeResolutionStore,
  repo: Repo,
  placement: MultiRepoPlacement
) {
  assertMultiRepoPlacementHost(store, repo)
  const journal = owners.get(store)
  if (!journal) {
    throw new Error('Multi-repo execution owner is unavailable')
  }
  const task = journal.get(placement.taskId)
  const member = task?.plan.members.find((entry) => entry.repoId === placement.repoId)
  const state = task?.members.find((entry) => entry.repoId === placement.repoId)
  if (
    !task ||
    !member ||
    repo.id !== member.repoId ||
    state?.state !== 'creating' ||
    task.root.state !== 'created'
  ) {
    throw new Error('Multi-repo member has no active persisted creation intent')
  }
  const root = task.plan.rootPath
  if (
    dirname(root) !== task.plan.parentPath ||
    member.worktreePath !== join(root, member.directoryName) ||
    dirname(member.worktreePath) !== root ||
    resolve(member.repoPath) !== resolve(repo.path)
  ) {
    throw new Error('Multi-repo placement does not match its recorded layout')
  }
  if (
    (await realpath(root)) !== root ||
    !(await lstat(root)).isDirectory() ||
    (await realpath(task.plan.parentPath)) !== task.plan.parentPath
  ) {
    throw new Error('Multi-repo root was replaced or moved')
  }
  const common = await readRepoCommonDirFromGit(repo.path)
  if (!common || (await realpath(common)) !== member.commonDir) {
    throw new Error('Multi-repo repository identity changed')
  }
  try {
    await lstat(member.worktreePath)
    throw new Error('Multi-repo member path already exists; recover it before retrying')
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
      throw error
    }
  }
  if (
    findPendingWorktreeRemovalConflict(repo.path, { worktreePath: member.worktreePath }) ||
    (await getBranchConflictKind(repo.path, member.branchName))
  ) {
    throw new Error('Multi-repo branch or path is already owned')
  }
  if (owners.get(store) !== journal || journal.get(task.taskId)?.revision !== task.revision) {
    throw new Error('Multi-repo creation intent changed during validation')
  }
  return { ...member, rootPath: root }
}
