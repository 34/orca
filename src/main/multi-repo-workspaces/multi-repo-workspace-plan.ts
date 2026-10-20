import { isDeepStrictEqual } from 'node:util'
import { lstat, realpath } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { getRepoExecutionHostId } from '../../shared/execution-host'
import { pluginPathSegmentError } from '../../shared/plugins/plugin-path-safety'
import type { Repo } from '../../shared/repo-types'
import { getLocalProjectGitExecOptions } from '../project-runtime-git-options'
import type { ProjectRuntimeResolutionStore } from '../local-project-runtime-resolution'
import { getBranchConflictKind } from '../git/repo-branch-conflict'
import { resolveWorktreeBaseCommitOid } from '../git/worktree-base-ref-probe'
import { readRepoCommonDirFromGit } from '../git/worktree-list-reader'
import { gitExecFileAsync } from '../git/runner'
import { isWslUncPath } from '../../shared/wsl-paths'
import { shouldRunSetupForCreate } from '../effective-hook-config'
import { getEffectiveHooks } from '../hooks'

import type {
  MultiRepoMemberSelection,
  MultiRepoMemberPlan,
  MultiRepoWorkspacePlan
} from '../../shared/multi-repo-workspaces/multi-repo-workspace-contract'
export type {
  MultiRepoMemberSelection,
  MultiRepoMemberPlan,
  MultiRepoWorkspacePlan
} from '../../shared/multi-repo-workspaces/multi-repo-workspace-contract'

function validateDirectoryName(name: string): void {
  const error = pluginPathSegmentError(name)
  if (
    error ||
    name.toLowerCase().startsWith('context-') ||
    /[/\\]/.test(name) ||
    Buffer.byteLength(name) > 100
  ) {
    throw new Error(`Invalid workspace directory name: ${name}`)
  }
}

async function assertAbsent(path: string): Promise<void> {
  try {
    await lstat(path)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return
    }
    throw error
  }
  throw new Error(`Workspace path already exists: ${path}`)
}

// This is read-only; the execution owner must recheck the plan before each mutation.
export async function planMultiRepoWorkspace(args: {
  store: ProjectRuntimeResolutionStore & { getRepo: (id: string) => Repo | undefined }
  parentPath: string
  directoryName: string
  members: MultiRepoMemberSelection[]
  confirmedPlan?: MultiRepoWorkspacePlan
  existingRoot?: string
}): Promise<MultiRepoWorkspacePlan> {
  validateDirectoryName(args.directoryName)
  if (!isAbsolute(args.parentPath) || isWslUncPath(args.parentPath)) {
    throw new Error('Choose an absolute native-local workspace parent directory')
  }
  if (args.members.length === 0) {
    throw new Error('Select at least one repository')
  }
  const names = new Set(['task.md', 'agents.md', '.orca-multi-repo.json', '.git'])
  const selections = args.members.map((member) => {
    validateDirectoryName(member.directoryName)
    const folded = member.directoryName.normalize('NFD').toLowerCase()
    if (names.has(folded)) {
      throw new Error(`Duplicate member directory: ${member.directoryName}`)
    }
    names.add(folded)
    const repo = args.store.getRepo(member.repoId)
    if (!repo || repo.kind === 'folder' || getRepoExecutionHostId(repo) !== 'local') {
      throw new Error(
        `Only registered native-local Git repositories are supported: ${member.repoId}`
      )
    }
    const options = getLocalProjectGitExecOptions(args.store, repo)
    if (options.wslDistro || isWslUncPath(repo.path)) {
      throw new Error(`WSL repositories are not supported: ${member.repoId}`)
    }
    if (!member.baseRef || member.baseRef.startsWith('-')) {
      throw new Error('Invalid base ref')
    }
    if (!member.branchName || member.branchName.startsWith('-')) {
      throw new Error('Invalid branch name')
    }
    if (getEffectiveHooks(repo)?.scripts.setup) {
      shouldRunSetupForCreate(repo, member.setupDecision)
    }
    return { member, repo }
  })
  const parentPath = await realpath(args.parentPath)
  if (!(await lstat(parentPath)).isDirectory()) {
    throw new Error('Workspace parent must be a directory')
  }
  const rootPath = join(parentPath, args.directoryName)
  if (args.existingRoot !== rootPath) {
    await assertAbsent(rootPath)
  }
  const commonDirs = new Set<string>()
  const members: MultiRepoMemberPlan[] = []
  for (const { member, repo } of selections) {
    await assertAbsent(join(rootPath, member.directoryName))
    const common = await readRepoCommonDirFromGit(repo.path)
    if (!common) {
      throw new Error(`Cannot verify repository identity: ${repo.path}`)
    }
    const commonDir = await realpath(common)
    if (commonDirs.has(commonDir)) {
      throw new Error('Select each Git repository only once')
    }
    commonDirs.add(commonDir)
    await gitExecFileAsync(['check-ref-format', '--branch', member.branchName], { cwd: repo.path })
    if (await getBranchConflictKind(repo.path, member.branchName)) {
      throw new Error(`Branch already exists: ${member.branchName}`)
    }
    const baseCommit = await resolveWorktreeBaseCommitOid(repo.path, member.baseRef)
    if (!baseCommit) {
      throw new Error(`Cannot resolve base ref: ${member.baseRef}`)
    }
    members.push({
      ...member,
      repoPath: await realpath(repo.path),
      commonDir,
      baseCommit,
      worktreePath: join(rootPath, member.directoryName)
    })
  }
  const plan = { parentPath, rootPath, members }
  if (args.confirmedPlan && !isDeepStrictEqual(plan, args.confirmedPlan)) {
    throw new Error('Workspace plan changed; preview and confirm the updated plan before creating')
  }
  return plan
}
