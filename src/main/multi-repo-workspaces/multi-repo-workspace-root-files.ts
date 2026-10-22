import { multiRepoAttachmentName } from '../../shared/multi-repo-workspaces/multi-repo-attachment'
import { lstat, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { MultiRepoTask } from '../../shared/multi-repo-workspaces/multi-repo-workspace-contract'
import type { MultiRepoWorkspaceStore } from './multi-repo-workspace-store'

export function multiRepoRootFiles(task: MultiRepoTask): Record<string, string | Buffer> {
  const context = task.context
  const attachments = context?.attachments ?? []
  return {
    '.orca-multi-repo.json': JSON.stringify(
      { schemaVersion: 1, taskId: task.taskId, members: task.plan.members },
      null,
      2
    ),
    ...Object.fromEntries(
      attachments.map((file) => [multiRepoAttachmentName(file), Buffer.from(file.base64, 'base64')])
    ),
    ...(context
      ? {
          'AGENTS.md': [
            '# Workspace rules',
            '',
            'Read TASK.md before working. Work in member directories that currently exist; TASK.md retains creation plans for removed members. Follow each member repository’s rules and run Git commands in its directory.',
            '',
            context.rules,
            '',
            context.agentInstructions,
            '',
            '## Skills',
            ...(context.skillInstallation === 'workspace'
              ? [
                  'Use the installed workspace skills under .agents/skills. The following paths record their original sources.'
                ]
              : []),
            ...context.skills.map((skill) =>
              context.skillInstallation === 'workspace'
                ? `- ${skill.name}: source ${skill.path}`
                : `- For ${skill.name}, read ${skill.path} before using it.`
            ),
            '',
            '## Plugin context',
            context.pluginNotes,
            ''
          ].join('\n')
        }
      : {}),
    'TASK.md': [
      `# ${task.name}`,
      '',
      task.prompt,
      '',
      ...(context
        ? [
            '## Context files',
            '',
            ...attachments.map((file) => `- ${file.name}: ${multiRepoAttachmentName(file)}`),
            '',
            'Repository entries below are creation plans. Work only in member directories that currently exist.',
            ''
          ]
        : []),
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
        if (
          !(await lstat(path)).isFile() ||
          !(await readFile(path)).equals(Buffer.from(files[name]))
        ) {
          throw new Error(`Multi-repo generated file changed: ${name}`)
        }
      }
      for (const [name, content] of Object.entries(files)) {
        if (!names.includes(name)) {
          await writeFile(join(root, name), content, { flag: 'wx', mode: 0o600 })
        }
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
