import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { multiRepoTaskSchema } from '../../shared/multi-repo-workspaces/multi-repo-workspace-contract'
import {
  installMultiRepoWorkspaceSkills,
  removeMultiRepoWorkspaceSkills
} from './multi-repo-workspace-skills'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})
async function fixture() {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'orca-multi-skill-')))
  directories.push(parent)
  const root = join(parent, 'workspace')
  const source = join(parent, 'source')
  await mkdir(root)
  await mkdir(source)
  await writeFile(
    join(source, 'SKILL.md'),
    '---\nname: workspace-check\ndescription: Check a workspace\n---\nRead reference.txt.\n'
  )
  await writeFile(join(source, 'reference.txt'), 'supporting file\n')
  const id = randomUUID()
  const task = multiRepoTaskSchema.parse({
    schemaVersion: 1,
    taskId: id,
    requestId: id,
    revision: 0,
    profileId: 'test',
    hostId: 'local',
    name: 'Skill test',
    prompt: 'Check the workspace',
    context: {
      skillInstallation: 'workspace',
      skills: [{ name: 'Workspace check', path: join(source, 'SKILL.md') }]
    },
    plan: {
      parentPath: parent,
      rootPath: root,
      members: [
        {
          repoId: 'repo',
          directoryName: 'repo',
          baseRef: 'main',
          branchName: 'task/test',
          setupDecision: 'skip',
          repoPath: join(parent, 'repo'),
          commonDir: join(parent, 'repo', '.git'),
          baseCommit: 'a'.repeat(40),
          worktreePath: join(root, 'repo')
        }
      ]
    },
    root: { state: 'created', folderWorkspaceId: 'folder' },
    members: [{ repoId: 'repo', state: 'planned', setup: 'pending' }],
    agent: { state: 'pending' }
  })
  await writeFile(
    join(root, '.orca-multi-repo.json'),
    JSON.stringify({
      schemaVersion: 1,
      taskId: task.taskId,
      members: task.plan.members
    })
  )
  return {
    task,
    source,
    state: join(parent, 'state'),
    installed: join(root, '.agents', 'skills', 'workspace-check')
  }
}

it('installs a complete local package, discovers it, and replays without changing the source', async () => {
  const { task, state, source, installed } = await fixture()
  await installMultiRepoWorkspaceSkills(task, state, 'test-host')
  expect(await readFile(join(installed, 'reference.txt'), 'utf8')).toBe('supporting file\n')
  expect(await readFile(join(installed, 'SKILL.md'), 'utf8')).toBe(
    await readFile(join(source, 'SKILL.md'), 'utf8')
  )
  await installMultiRepoWorkspaceSkills(task, state, 'test-host')
  expect(await readFile(join(source, 'reference.txt'), 'utf8')).toBe('supporting file\n')
  await rm(source, { recursive: true })
  await removeMultiRepoWorkspaceSkills(task, state, 'test-host')
  await expect(readFile(join(installed, 'SKILL.md'))).rejects.toMatchObject({ code: 'ENOENT' })
  await expect(realpath(join(task.plan.rootPath, '.agents'))).rejects.toMatchObject({
    code: 'ENOENT'
  })
  await removeMultiRepoWorkspaceSkills(task, state, 'test-host')
})

it('preserves locally edited installed skills when a retry would conflict', async () => {
  const { task, state, installed } = await fixture()
  await installMultiRepoWorkspaceSkills(task, state, 'test-host')
  await writeFile(join(installed, 'reference.txt'), 'user edits\n')
  await expect(installMultiRepoWorkspaceSkills(task, state, 'test-host')).rejects.toThrow(
    'conflict'
  )
  await expect(removeMultiRepoWorkspaceSkills(task, state, 'test-host')).rejects.toThrow('conflict')
  expect(await readFile(join(installed, 'reference.txt'), 'utf8')).toBe('user edits\n')
})

it('keeps unrelated workspace skills when removing the task-owned copies', async () => {
  const { task, state, installed } = await fixture()
  await installMultiRepoWorkspaceSkills(task, state, 'test-host')
  const unrelated = join(task.plan.rootPath, '.agents', 'skills', 'user-skill')
  await mkdir(unrelated)
  await writeFile(join(unrelated, 'SKILL.md'), 'User content\n')
  await removeMultiRepoWorkspaceSkills(task, state, 'test-host')
  expect(await readFile(join(unrelated, 'SKILL.md'), 'utf8')).toBe('User content\n')
  await expect(readFile(join(installed, 'SKILL.md'))).rejects.toMatchObject({ code: 'ENOENT' })
})

it('keeps legacy references untouched and refuses a mismatched workspace marker', async () => {
  const { task, state, installed } = await fixture()
  if (!task.context) {
    throw new Error('Missing context')
  }
  delete task.context.skillInstallation
  await installMultiRepoWorkspaceSkills(task, state, 'test-host')
  await expect(readFile(join(installed, 'SKILL.md'))).rejects.toMatchObject({ code: 'ENOENT' })
  task.context.skillInstallation = 'workspace'
  await writeFile(join(task.plan.rootPath, '.orca-multi-repo.json'), '{"taskId":"other"}')
  await expect(installMultiRepoWorkspaceSkills(task, state, 'test-host')).rejects.toThrow(
    'marker changed'
  )
})
