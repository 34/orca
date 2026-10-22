import { composeWorktreeId } from '../../shared/worktree/id'
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
const owners = new WeakMap<ProjectRuntimeResolutionStore, MultiRepoWorkspaceStore>()

export async function resolveMultiRepoWritableDirectories(
  store: ProjectRuntimeResolutionStore,
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
    task.pendingRootPlan ||
    !task.members.some((member) => member.state === 'ready') ||
    task.members.some((member) => member.state !== 'ready' && member.state !== 'removed')
  ) {
    throw new Error('Multi-repo workspace is not ready for member permissions')
  }
  const activeMembers = task.plan.members.filter(
    (plan) => task.members.find((member) => member.repoId === plan.repoId)?.state !== 'removed'
  )
  await verifyMultiRepoWorkspaceIdentity({ ...task.plan, members: activeMembers })
  if (owners.get(store) !== journal || journal.get(task.taskId)?.revision !== task.revision) {
    throw new Error('Multi-repo permission intent changed during validation')
  }
  return [...new Set(activeMembers.map((member) => member.commonDir))]
}

export function bindMultiRepoWorkspaceOwner(
  runtimeStore: ProjectRuntimeResolutionStore,
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

export function isMultiRepoMemberRegistrationPending(
  store: ProjectRuntimeResolutionStore,
  repo: Repo,
  worktreeId: string
): boolean {
  if (getRepoExecutionHostId(repo) !== 'local' || isWslUncPath(repo.path)) {
    return false
  }
  return (
    owners
      .get(store)
      ?.list()
      .some(
        (task) =>
          task.root.state === 'created' &&
          task.plan.members.some((plan) => {
            const member = task.members.find((entry) => entry.repoId === plan.repoId)
            return (
              plan.repoId === repo.id &&
              plan.repoPath === repo.path &&
              worktreeId === composeWorktreeId(repo.id, plan.worktreePath) &&
              Boolean(member?.plannedInstanceId) &&
              !member?.instanceId &&
              !member?.worktreeId &&
              (member?.state === 'creating' || member?.state === 'needs-attention')
            )
          })
      ) ?? false
  )
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
  placement: MultiRepoPlacement,
  expectedState: 'creating' | 'needs-attention' = 'creating'
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
    state?.state !== expectedState ||
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
  return { ...member, rootPath: root, instanceId: state.plannedInstanceId }
}
