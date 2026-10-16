import { lstat, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { MultiRepoTask } from '../../shared/multi-repo-workspaces/multi-repo-workspace-contract'
import type { MultiRepoWorkspaceStore } from './multi-repo-workspace-store'

export function multiRepoRootFiles(task: MultiRepoTask): Record<string, string> {
  return {
    '.orca-multi-repo.json': JSON.stringify(
      { schemaVersion: 1, taskId: task.taskId, members: task.plan.members },
      null,
      2
    ),
    'TASK.md': [
      `# ${task.name}`,
      '',
      task.prompt,
      '',
      '## Repositories',
      '',
      ...task.plan.members.map(
        (member) =>
          `- ${member.directoryName}: ${member.baseRef} (${member.baseCommit}), branch ${member.branchName}`
      ),
      '',
      'Follow each repository’s AGENTS.md and CLAUDE.md. Run Git commands inside the relevant member directory.',
      ''
    ].join('\n')
  }
}

export async function recoverMultiRepoRootFiles(
  task: MultiRepoTask,
  journal: MultiRepoWorkspaceStore
): Promise<MultiRepoTask> {
  if (
    (task.root.state !== 'creating' && task.root.state !== 'needs-attention') ||
    task.root.folderWorkspaceId ||
    task.root.folderRegistration ||
    task.members.some(
      (member) =>
        member.state !== 'planned' ||
        member.worktreeId ||
        member.instanceId ||
        member.setup !== 'pending'
    )
  ) {
    return task
  }
  try {
    const root = task.plan.rootPath
    if (
      dirname(root) !== task.plan.parentPath ||
      (await realpath(task.plan.parentPath)) !== task.plan.parentPath
    ) {
      throw new Error('Multi-repo parent directory changed')
    }
    const stat = await lstat(root).catch((error: unknown) => {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return null
      }
      throw error
    })
    if (!stat) {
      task.root.state = 'planned'
    } else {
      if (!stat.isDirectory() || (await realpath(root)) !== root) {
        throw new Error('Multi-repo root was replaced or moved')
      }
      const files = multiRepoRootFiles(task)
      const names = await readdir(root)
      if (
        !names.includes('.orca-multi-repo.json') ||
        names.some((name) => !Object.hasOwn(files, name))
      ) {
        throw new Error('Multi-repo root contains unverified files; preserve it for reconciliation')
      }
      for (const name of names) {
        const path = join(root, name)
        if (!(await lstat(path)).isFile() || (await readFile(path, 'utf8')) !== files[name]) {
          throw new Error(`Multi-repo generated file changed: ${name}`)
        }
      }
      if (!names.includes('TASK.md')) {
        await writeFile(join(root, 'TASK.md'), files['TASK.md'], { flag: 'wx', mode: 0o600 })
      }
      task.root.state = 'created'
    }
    task.root.error = undefined
  } catch (error) {
    task.root.state = 'needs-attention'
    task.root.error = error instanceof Error ? error.message : String(error)
  }
  return journal.save(task, task.revision)
}
