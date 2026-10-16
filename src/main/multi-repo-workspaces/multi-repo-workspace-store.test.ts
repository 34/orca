import { randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { MultiRepoTask } from '../../shared/multi-repo-workspaces/multi-repo-workspace-contract'
import * as durableWrite from '../durable-file-write'
import { MultiRepoWorkspaceStore } from './multi-repo-workspace-store'

let profilePath: string
let store: MultiRepoWorkspaceStore
let task: MultiRepoTask
function recordPath(): string {
  return join(profilePath, 'multi-repo-workspaces', 'tasks', `${task.taskId}.json`)
}
beforeEach(() => {
  profilePath = mkdtempSync(join(tmpdir(), 'orca-multi-repo-store-'))
  store = new MultiRepoWorkspaceStore(profilePath, 'profile-a')
  const taskId = randomUUID()
  const rootPath = join(profilePath, 'tasks', taskId)
  task = {
    schemaVersion: 1,
    taskId,
    requestId: taskId,
    revision: 0,
    profileId: 'profile-a',
    hostId: 'local',
    name: '需求 A',
    prompt: 'Update API and web',
    plan: {
      parentPath: join(profilePath, 'tasks'),
      rootPath,
      members: [
        {
          repoId: 'api',
          directoryName: 'api',
          baseRef: 'main',
          branchName: 'task/a',
          setupDecision: 'skip',
          repoPath: join(profilePath, 'source'),
          commonDir: join(profilePath, 'source', '.git'),
          baseCommit: 'a'.repeat(40),
          worktreePath: join(rootPath, 'api')
        }
      ]
    },
    root: { state: 'planned' },
    members: [{ repoId: 'api', state: 'planned', setup: 'pending' }],
    agent: { state: 'pending' }
  }
})
afterEach(() => {
  vi.restoreAllMocks()
  rmSync(profilePath, { recursive: true, force: true })
})

it('persists intent and resumes the same task after reopening the profile', () => {
  expect(store.list()).toEqual([])
  const saved = store.save(task, null)
  store.close()
  const reopened = new MultiRepoWorkspaceStore(profilePath, 'profile-a')
  expect(reopened.get(task.requestId)).toEqual(saved)
  const updated = reopened.save({ ...saved, root: { state: 'creating' } }, saved.revision)
  expect(updated.revision).toBe(1)
  expect(reopened.list()).toEqual([updated])
})

it('rejects duplicate creation and stale results without losing newer state', () => {
  const original = store.save(task, null)
  expect(() => store.save(task, null)).toThrow('revision conflict')
  const updated = store.save(
    { ...original, root: { state: 'created', folderWorkspaceId: 'root' } },
    0
  )
  expect(() => store.save(original, 0)).toThrow('revision conflict')
  expect(store.get(task.taskId)).toEqual(updated)
})

it('fences old profile operations after close and rejects another profile identity', () => {
  store.save(task, null)
  store.close()
  expect(() => store.save(task, 0)).toThrow('closed')
  expect(() => store.list()).toThrow('closed')
  const another = new MultiRepoWorkspaceStore(profilePath, 'profile-b')
  expect(() => another.get(task.taskId)).toThrow('identity')
  expect(() => another.save(task, 0)).toThrow('identity')
})

it('rejects path traversal and mismatched request identity', () => {
  expect(() => store.get('../outside')).toThrow()
  expect(() => store.save({ ...task, requestId: randomUUID() }, null)).toThrow('identity')
  expect(store.list()).toEqual([])
})

it('cannot rewrite the recorded plan during retry or change member identity', () => {
  const saved = store.save(task, null)
  const changed = structuredClone(saved)
  changed.plan.members[0].branchName = 'different'
  expect(() => store.save(changed, 0)).toThrow('cannot change')
  changed.plan = saved.plan
  changed.members[0].repoId = 'web'
  expect(() => store.save(changed, 0)).toThrow('does not match')
  expect(store.get(task.taskId)).toEqual(saved)
})

it.each(['{broken', JSON.stringify({ schemaVersion: 2, futureData: 'must survive' })])(
  'refuses damaged or newer records without replacing their bytes',
  (contents) => {
    store.save(task, null)
    writeFileSync(recordPath(), contents)
    expect(() => store.get(task.taskId)).toThrow()
    expect(() => store.save(task, 0)).toThrow()
    expect(readFileSync(recordPath(), 'utf8')).toBe(contents)
  }
)

it('validates member correspondence on reads as well as writes', () => {
  store.save(task, null)
  writeFileSync(recordPath(), JSON.stringify({ ...task, members: [] }))
  expect(() => store.get(task.taskId)).toThrow()
})

it('keeps the previous record when persistence fails and ignores abandoned temp files', () => {
  store.save(task, null)
  const before = readFileSync(recordPath(), 'utf8')
  const persist = vi.spyOn(durableWrite, 'writeFileDurableSync').mockImplementationOnce(() => {
    throw new Error('disk full')
  })
  expect(() => store.save({ ...task, root: { state: 'creating' } }, 0)).toThrow('disk full')
  expect(readFileSync(recordPath(), 'utf8')).toBe(before)
  persist.mockRestore()
  writeFileSync(`${recordPath()}.abandoned.tmp`, '{partial')
  expect(store.list()).toEqual([task])
  expect(readdirSync(join(profilePath, 'multi-repo-workspaces', 'tasks'))).toHaveLength(2)
})
