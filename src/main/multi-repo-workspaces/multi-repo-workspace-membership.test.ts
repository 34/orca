import { startMultiRepoRootAgent } from './multi-repo-workspace-agent'
import { randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { MultiRepoTask } from '../../shared/multi-repo-workspaces/multi-repo-workspace-contract'
import { multiRepoContextSchema } from '../../shared/multi-repo-workspaces/multi-repo-workspace-contract'
import * as durable from '../durable-file-write'
import { multiRepoRootFiles } from './multi-repo-workspace-root-files'
import { MultiRepoWorkspaceStore } from './multi-repo-workspace-store'
import { syncMultiRepoMembershipFiles } from './multi-repo-workspace-membership'
import { verifyMultiRepoRootOwnership } from './multi-repo-workspace-root-registration'
import { readMultiRepoDefaults, saveMultiRepoDefaults } from './multi-repo-workspace-defaults'

let root: string
let journal: MultiRepoWorkspaceStore
let task: MultiRepoTask
beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'orca-membership-')))
  const rootPath = join(root, 'task')
  await mkdir(rootPath)
  journal = new MultiRepoWorkspaceStore(join(root, 'profile'), 'profile')
  const id = randomUUID()
  task = journal.save(
    {
      schemaVersion: 1,
      taskId: id,
      requestId: id,
      revision: 0,
      profileId: 'profile',
      hostId: 'local',
      name: 'Feature',
      prompt: '**Acceptance**',
      plan: {
        parentPath: root,
        rootPath,
        members: [
          {
            repoId: 'api',
            directoryName: 'api',
            baseRef: 'main',
            branchName: 'task/feature',
            setupDecision: 'skip',
            repoPath: join(root, 'api'),
            commonDir: join(root, 'api', '.git'),
            baseCommit: 'a'.repeat(40),
            worktreePath: join(rootPath, 'api')
          }
        ]
      },
      root: { state: 'created' },
      members: [{ repoId: 'api', state: 'ready', setup: 'skipped' }],
      agent: { state: 'pending' }
    },
    null
  )
  for (const [name, content] of Object.entries(multiRepoRootFiles(task))) {
    await writeFile(join(rootPath, name), content)
  }
})
afterEach(async () => {
  vi.restoreAllMocks()
  await rm(root, { recursive: true, force: true })
})
function addition() {
  return {
    ...task.plan.members[0],
    repoId: 'web',
    directoryName: 'web',
    repoPath: join(root, 'web'),
    commonDir: join(root, 'web', '.git'),
    worktreePath: join(task.plan.rootPath, 'web')
  }
}

it('durably appends without altering existing plans and reconciles generated context', async () => {
  const initial = structuredClone(task.plan)
  const pending = journal.appendMembers(task.taskId, task.revision, [addition()])
  expect(pending.pendingRootPlan).toEqual(initial)
  expect(pending.plan.members[0]).toEqual(initial.members[0])
  expect(pending.members[1].state).toBe('planned')
  const complete = await syncMultiRepoMembershipFiles(pending, journal)
  expect(complete.pendingRootPlan).toBeUndefined()
  await verifyMultiRepoRootOwnership(complete)
  expect(await readFile(join(complete.plan.rootPath, 'TASK.md'), 'utf8')).toContain('- web:')
  expect(() =>
    journal.save(
      { ...complete, plan: { ...complete.plan, rootPath: join(root, 'changed') } },
      complete.revision
    )
  ).toThrow('cannot change')
})

it('recovers an interrupted context refresh after reopening the journal', async () => {
  const pending = journal.appendMembers(task.taskId, task.revision, [addition()])
  const write = durable.writeFileDurable
  let calls = 0
  vi.spyOn(durable, 'writeFileDurable').mockImplementation(async (...args) => {
    if (++calls === 2) {
      throw new Error('Interrupted before marker commit')
    }
    return write(...args)
  })
  await expect(syncMultiRepoMembershipFiles(pending, journal)).rejects.toThrow('Interrupted')
  vi.restoreAllMocks()
  const reopened = new MultiRepoWorkspaceStore(join(root, 'profile'), 'profile')
  const restored = reopened.get(task.taskId)!
  const complete = await syncMultiRepoMembershipFiles(restored, reopened)
  await verifyMultiRepoRootOwnership(complete)
  expect(complete.members).toHaveLength(2)
})

it('preserves user-modified generated context during membership changes', async () => {
  const pending = journal.appendMembers(task.taskId, task.revision, [addition()])
  await writeFile(join(task.plan.rootPath, 'TASK.md'), 'User notes')
  await expect(syncMultiRepoMembershipFiles(pending, journal)).rejects.toThrow('preserve')
  expect(await readFile(join(task.plan.rootPath, 'TASK.md'), 'utf8')).toBe('User notes')
  expect(journal.get(task.taskId)?.pendingRootPlan).toBeDefined()
})

it('rejects duplicate directories, repositories, stale revisions and simultaneous appends', () => {
  expect(() => journal.appendMembers(task.taskId, task.revision + 1, [addition()])).toThrow(
    'refresh'
  )
  expect(() =>
    journal.appendMembers(task.taskId, task.revision, [{ ...addition(), directoryName: 'API' }])
  ).toThrow('already part')
  expect(() =>
    journal.appendMembers(task.taskId, task.revision, [
      { ...addition(), commonDir: task.plan.members[0].commonDir }
    ])
  ).toThrow('already part')
  const pending = journal.appendMembers(task.taskId, task.revision, [addition()])
  expect(() => journal.appendMembers(task.taskId, pending.revision, [addition()])).toThrow(
    'refresh'
  )
})

it('writes binary attachment bytes and scoped rules without changing member paths', () => {
  const bytes = Buffer.from([0, 255, 128, 12])
  const id = randomUUID()
  const context = multiRepoContextSchema.parse({
    rules: 'Run focused tests.',
    agentInstructions: 'Report remaining work.',
    attachments: [
      { id, name: '../../diagram.png', mime: 'image/png', base64: bytes.toString('base64') }
    ]
  })
  const files = multiRepoRootFiles({ ...task, context })
  expect(files[`context-${id}.png`]).toEqual(bytes)
  expect(files['AGENTS.md']).toContain('Run focused tests.')
  expect(Object.keys(files).every((name) => !name.includes('/') && !name.includes('\\'))).toBe(true)
})

it('keeps defaults profile-scoped and requires unique naming templates', () => {
  const profile = join(root, 'profile')
  const defaults = readMultiRepoDefaults(profile)
  expect(defaults.branchTemplate).toBe('task/{name}-{id}')
  expect(() =>
    saveMultiRepoDefaults(profile, { ...defaults, branchTemplate: 'feature/{name}' })
  ).toThrow('include {id}')
  saveMultiRepoDefaults(profile, {
    ...defaults,
    branchTemplate: 'feature/{name}-{id}',
    rules: 'Use focused tests.'
  })
  expect(readMultiRepoDefaults(profile).rules).toBe('Use focused tests.')
  expect(readMultiRepoDefaults(join(root, 'other-profile')).rules).toBe('')
})

it('re-adds a removed repository with a fresh branch while retaining its old plan', async () => {
  task.members[0].state = 'removed'
  task = journal.save(task, task.revision)
  const replacement = { ...task.plan.members[0], branchName: 'task/readded' }
  const pending = journal.appendMembers(task.taskId, task.revision, [replacement])
  expect(pending.members).toHaveLength(1)
  expect(pending.members[0].state).toBe('planned')
  expect(pending.retiredMembers?.[0].branchName).toBe('task/feature')
  const complete = await syncMultiRepoMembershipFiles(pending, journal)
  await verifyMultiRepoRootOwnership(complete)
  expect(await readFile(join(complete.plan.rootPath, 'TASK.md'), 'utf8')).toContain('task/readded')
})

it('does not replay an earlier failed agent launch after membership changes', async () => {
  task.agent = {
    state: 'failed',
    selected: 'codex',
    operationId: `${Date.now()}-${randomUUID().replaceAll('-', '')}`,
    error: 'Response interrupted'
  }
  task = journal.save(task, task.revision)
  const pending = journal.appendMembers(task.taskId, task.revision, [addition()])
  const complete = await syncMultiRepoMembershipFiles(pending, journal)
  complete.members.forEach((member) => {
    member.state = 'ready'
    member.setup = 'skipped'
  })
  const launch = vi.fn()
  await startMultiRepoRootAgent({ task: complete, journal, launch })
  expect(launch).not.toHaveBeenCalled()
  expect(complete.agent.relaunchRequired).toBe(true)
})
