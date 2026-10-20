import { lstat, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import type { Repo } from '../../shared/repo-types'
import { gitExecFileAsync } from '../git/runner'
import { addWorktree } from '../git/worktree'
import { readRepoLocation } from '../git/worktree-list-reader'
import { verifyMultiRepoWorkspaceIdentity } from './multi-repo-workspace-identity'
import { MultiRepoWorkspaceStore } from './multi-repo-workspace-store'
import {
  bindMultiRepoWorkspaceOwner,
  resolveMultiRepoWritableDirectories
} from './multi-repo-workspace-placement'
import { planMultiRepoWorkspace, type MultiRepoMemberSelection } from './multi-repo-workspace-plan'

let root: string
let repos: Repo[]
const identity = [
  '-c',
  'user.name=Test',
  '-c',
  'user.email=test@example.com',
  '-c',
  'commit.gpgSign=false'
]
async function git(cwd: string, ...args: string[]): Promise<string> {
  return (await gitExecFileAsync(args, { cwd })).stdout.trim()
}
function selection(repoId: string, branchName = 'task/a'): MultiRepoMemberSelection {
  return { repoId, directoryName: repoId, baseRef: 'main', branchName, setupDecision: 'skip' }
}
function plan(members = [selection('api'), selection('web')], directoryName = '需求 A') {
  return planMultiRepoWorkspace({
    store: { getRepo: (id) => repos.find((repo) => repo.id === id) },
    parentPath: root,
    directoryName,
    members
  })
}
beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'orca-multi-repo-')))
  repos = []
  for (const id of ['api', 'web', 'admin']) {
    const path = join(root, `source-${id}`)
    await git(root, 'init', '--quiet', path)
    await git(path, 'symbolic-ref', 'HEAD', 'refs/heads/main')
    await writeFile(join(path, 'file.txt'), 'original\n')
    await git(path, 'add', '.')
    await git(path, ...identity, 'commit', '-qm', 'initial')
    repos.push({ id, path, displayName: id, badgeColor: '', addedAt: 0, projectGroupId: id })
  }
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

it('plans cross-group A/B worktrees at pinned commits through existing Git creation', async () => {
  const a = await plan()
  const b = await plan([selection('api', 'task/b'), selection('admin', 'task/b')], '需求 B')
  await expect(lstat(a.rootPath)).rejects.toMatchObject({ code: 'ENOENT' })
  await writeFile(join(repos[0].path, 'file.txt'), 'source dirty\n')
  for (const task of [a, b]) {
    await mkdir(task.rootPath)
    for (const member of task.members) {
      await addWorktree(member.repoPath, member.worktreePath, member.branchName, member.baseCommit)
      expect(await git(member.worktreePath, 'rev-parse', 'HEAD')).toBe(member.baseCommit)
      expect((await lstat(member.worktreePath)).isSymbolicLink()).toBe(false)
      expect(await readFile(join(member.worktreePath, 'file.txt'), 'utf8')).toBe('original\n')
    }
  }
  for (const member of a.members) {
    await writeFile(join(member.worktreePath, 'file.txt'), 'task A\n')
    // Exercise Git metadata outside the common root without altering source checkouts.
    await git(a.rootPath, '-C', member.directoryName, ...identity, 'commit', '-qam', 'task A')
  }
  await verifyMultiRepoWorkspaceIdentity(a)
  await verifyMultiRepoWorkspaceIdentity(b)
  expect(await readFile(join(b.members[0].worktreePath, 'file.txt'), 'utf8')).toBe('original\n')
  expect(await readFile(join(repos[0].path, 'file.txt'), 'utf8')).toBe('source dirty\n')
  expect(await readFile(join(repos[1].path, 'file.txt'), 'utf8')).toBe('original\n')
  expect(await git(repos[0].path, 'branch', '--show-current')).toBe('main')
})

it('refuses changed branches and substituted Git metadata before root launch', async () => {
  const task = await plan()
  await mkdir(task.rootPath)
  for (const member of task.members) {
    await addWorktree(member.repoPath, member.worktreePath, member.branchName, member.baseCommit)
  }
  const [api, web] = task.members
  await git(api.worktreePath, 'checkout', '--detach')
  await expect(verifyMultiRepoWorkspaceIdentity(task)).rejects.toThrow('Git identity changed')
  await git(api.worktreePath, 'checkout', api.branchName)
  const gitFile = join(api.worktreePath, '.git')
  const original = await readFile(gitFile, 'utf8')
  await writeFile(gitFile, await readFile(join(web.worktreePath, '.git'), 'utf8'))
  await expect(verifyMultiRepoWorkspaceIdentity(task)).rejects.toThrow('Git identity changed')
  await writeFile(gitFile, original)
  await verifyMultiRepoWorkspaceIdentity(task)
  const location = await readRepoLocation(api.worktreePath, api.worktreePath)
  expect(location).toBeDefined()
  if (!location) {
    throw new Error('Missing linked worktree location')
  }
  await writeFile(join(location.gitDir, 'gitdir'), `${join(web.worktreePath, '.git')}\n`)
  await expect(verifyMultiRepoWorkspaceIdentity(task)).rejects.toThrow('registration changed')
})

it('refuses a member replaced by a symlink to its source checkout', async () => {
  if (process.platform === 'win32') {
    return
  }
  const task = await plan([selection('api')])
  await mkdir(task.rootPath)
  await symlink(repos[0].path, task.members[0].worktreePath)
  await expect(verifyMultiRepoWorkspaceIdentity(task)).rejects.toThrow('layout changed')
})

it('grants only verified member metadata to the registered root in its owning profile', async () => {
  const layout = await plan()
  await mkdir(layout.rootPath)
  for (const member of layout.members) {
    await addWorktree(member.repoPath, member.worktreePath, member.branchName, member.baseCommit)
  }
  const journal = new MultiRepoWorkspaceStore(join(root, 'profile'), 'profile')
  const store = {}
  const close = bindMultiRepoWorkspaceOwner(store, journal)
  try {
    const taskId = randomUUID()
    let task = journal.save(
      {
        schemaVersion: 1,
        taskId,
        requestId: taskId,
        revision: 0,
        profileId: 'profile',
        hostId: 'local',
        name: 'Task',
        prompt: '',
        plan: layout,
        root: { state: 'created', folderWorkspaceId: 'root' },
        members: layout.members.map((member) => ({
          repoId: member.repoId,
          state: 'ready',
          setup: 'skipped'
        })),
        agent: { state: 'pending' }
      },
      null
    )
    await expect(
      resolveMultiRepoWritableDirectories(store, 'folder:root', layout.rootPath)
    ).resolves.toEqual(layout.members.map((member) => member.commonDir))
    await expect(
      resolveMultiRepoWritableDirectories({}, 'folder:root', layout.rootPath)
    ).resolves.toEqual([])
    await expect(
      resolveMultiRepoWritableDirectories(store, 'folder:other', layout.rootPath)
    ).resolves.toEqual([])
    await expect(resolveMultiRepoWritableDirectories(store, 'folder:root', root)).rejects.toThrow(
      'not ready'
    )
    task.members[0].state = 'removed'
    task = journal.save(task, task.revision)
    await expect(
      resolveMultiRepoWritableDirectories(store, 'folder:root', layout.rootPath)
    ).resolves.toEqual(layout.members.slice(1).map((member) => member.commonDir))
    task.members.forEach((member) => {
      member.state = 'removed'
    })
    journal.save(task, task.revision)
    await expect(
      resolveMultiRepoWritableDirectories(store, 'folder:root', layout.rootPath)
    ).rejects.toThrow('not ready')
  } finally {
    close()
  }
  await expect(
    resolveMultiRepoWritableDirectories(store, 'folder:root', layout.rootPath)
  ).resolves.toEqual([])
})

it('rejects duplicate Git identities even when registered through another checkout', async () => {
  const alias = join(root, 'alias')
  await addWorktree(repos[0].path, alias, 'alias', 'main')
  repos.push({ ...repos[0], id: 'alias', path: alias })
  await expect(plan([selection('api'), selection('alias')])).rejects.toThrow('only once')
})

it.each(['..', '../escape', 'a/b', 'a\\b', 'CON', 'nul.txt', 'trailing.', 'trailing ', 'a:b'])(
  'rejects unsafe cross-platform directory %s',
  async (directoryName) => {
    await expect(plan([{ ...selection('api'), directoryName }])).rejects.toThrow('directory name')
  }
)

it('rejects case-folded and generated-file collisions', async () => {
  await expect(plan([{ ...selection('api'), directoryName: '.git' }])).rejects.toThrow('Duplicate')
  await expect(
    plan([selection('api'), { ...selection('web'), directoryName: 'API' }])
  ).rejects.toThrow('Duplicate')
  await expect(plan([{ ...selection('api'), directoryName: 'TASK.md' }])).rejects.toThrow(
    'Duplicate'
  )
})

it('rejects an existing root, including a dangling symlink', async () => {
  await mkdir(join(root, 'existing'))
  await expect(plan(undefined, 'existing')).rejects.toThrow('already exists')
  if (process.platform !== 'win32') {
    await symlink(join(root, 'absent'), join(root, 'link'))
    await expect(plan(undefined, 'link')).rejects.toThrow('already exists')
  }
})

it('rejects existing branches and missing base refs without creating a task root', async () => {
  await expect(plan([selection('api', 'main')])).rejects.toThrow('Branch already exists')
  await expect(plan([{ ...selection('api'), baseRef: 'missing' }])).rejects.toThrow(
    'Cannot resolve'
  )
  await expect(lstat(join(root, '需求 A'))).rejects.toMatchObject({ code: 'ENOENT' })
})

it.each([
  { kind: 'folder' as const },
  { connectionId: 'remote' },
  { executionHostId: 'runtime:remote' as const },
  { path: String.raw`\\wsl.localhost\Ubuntu\repo` }
])('rejects unsupported repo ownership %j', async (patch) => {
  repos[0] = { ...repos[0], ...patch }
  await expect(plan()).rejects.toThrow(/native-local|WSL/)
})

it('pins the base even when the source branch advances after planning', async () => {
  const task = await plan([selection('api')])
  await writeFile(join(repos[0].path, 'file.txt'), 'new main\n')
  await git(repos[0].path, ...identity, 'commit', '-qam', 'advance main')
  const member = task.members[0]
  await addWorktree(member.repoPath, member.worktreePath, member.branchName, member.baseCommit)
  expect(await readFile(join(member.worktreePath, 'file.txt'), 'utf8')).toBe('original\n')
  expect(await git(member.worktreePath, 'rev-parse', 'HEAD')).toBe(member.baseCommit)
})

it('requires an explicit setup choice before creating anything', async () => {
  repos[0].hookSettings = {
    mode: 'override',
    setupRunPolicy: 'ask',
    commandSourcePolicy: 'local-only',
    scripts: { setup: 'echo setup', archive: '' }
  }
  await expect(plan([{ ...selection('api'), setupDecision: 'inherit' }])).rejects.toThrow(
    'Setup decision required'
  )
  await expect(plan([selection('api')])).resolves.toHaveProperty('members')
  await expect(lstat(join(root, '需求 A'))).rejects.toMatchObject({ code: 'ENOENT' })
})

it('revalidates the confirmed plan and refuses moved refs or edited targets without writing', async () => {
  const confirmedPlan = await plan()
  const request = {
    store: { getRepo: (id: string) => repos.find((repo) => repo.id === id) },
    parentPath: root,
    directoryName: '需求 A',
    members: [selection('api'), selection('web')],
    confirmedPlan
  }
  await expect(planMultiRepoWorkspace(request)).resolves.toEqual(confirmedPlan)
  await expect(planMultiRepoWorkspace({ ...request, directoryName: 'changed' })).rejects.toThrow(
    'plan changed'
  )
  await git(repos[0].path, ...identity, 'commit', '--allow-empty', '-qm', 'advance')
  await expect(planMultiRepoWorkspace(request)).rejects.toThrow('plan changed')
  await expect(lstat(confirmedPlan.rootPath)).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await git(repos[0].path, 'branch', '--list', 'task/a')).toBe('')
})
