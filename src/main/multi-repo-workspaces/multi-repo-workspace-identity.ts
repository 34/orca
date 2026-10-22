import { lstat, readFile, realpath } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import type { MultiRepoWorkspacePlan } from '../../shared/multi-repo-workspaces/multi-repo-workspace-contract'
import { readCheckedOutBranchRef, readRepoLocation } from '../git/worktree-list-reader'

export async function verifyMultiRepoWorkspaceIdentity(
  plan: MultiRepoWorkspacePlan
): Promise<void> {
  if (
    dirname(plan.rootPath) !== plan.parentPath ||
    (await realpath(plan.parentPath)) !== plan.parentPath ||
    (await realpath(plan.rootPath)) !== plan.rootPath ||
    !(await lstat(plan.rootPath)).isDirectory()
  ) {
    throw new Error('Multi-repo root was replaced or moved')
  }
  for (const member of plan.members) {
    if (
      member.worktreePath !== join(plan.rootPath, member.directoryName) ||
      dirname(member.worktreePath) !== plan.rootPath ||
      (await realpath(member.worktreePath)) !== member.worktreePath ||
      !(await lstat(join(member.worktreePath, '.git'))).isFile()
    ) {
      throw new Error(`Multi-repo member layout changed: ${member.directoryName}`)
    }
    const location = await readRepoLocation(member.worktreePath, member.worktreePath)
    if (
      !location ||
      (await realpath(location.topLevel)) !== member.worktreePath ||
      (await realpath(location.commonDir)) !== member.commonDir ||
      (await realpath(location.gitDir)) === member.commonDir ||
      (await readCheckedOutBranchRef(member.worktreePath)) !== `refs/heads/${member.branchName}`
    ) {
      throw new Error(`Multi-repo member Git identity changed: ${member.directoryName}`)
    }
    const backlink = (await readFile(join(location.gitDir, 'gitdir'), 'utf8')).trimEnd()
    if (
      (await realpath(resolve(location.gitDir, backlink))) !== join(member.worktreePath, '.git')
    ) {
      throw new Error(`Multi-repo member Git registration changed: ${member.directoryName}`)
    }
  }
}
