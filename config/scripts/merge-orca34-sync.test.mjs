import { expect, it, vi } from 'vitest'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fixture } from './orca34-sync-test-fixture.mjs'
import { mergeOrca34Sync, inspectOrca34MergedSync } from './merge-orca34-sync.mjs'

async function setup() {
  const f = await fixture()
  const folder = join(f.directory, 'sync', f.tag)
  const plan = JSON.parse(await readFile(join(folder, 'plan.json'), 'utf8'))
  const identity = {
    repository: '34/orca',
    branch: plan.stages[0].branch,
    head: f.target,
    base: 'main',
    baseCommit: f.base
  }
  await writeFile(
    join(folder, 'main-publication.json'),
    JSON.stringify({
      schemaVersion: 1,
      phase: 'published',
      identity,
      number: 42
    })
  )
  const pr = {
    number: 42,
    state: 'open',
    merged: false,
    merge_commit_sha: 'c'.repeat(40),
    head: { repo: { full_name: '34/orca' }, ref: identity.branch, sha: identity.head },
    base: { repo: { full_name: '34/orca' }, ref: 'main', sha: f.base }
  }
  const commit = { sha: pr.merge_commit_sha, parents: [{ sha: f.base }, { sha: f.target }] }
  const read = vi.fn(async (endpoint) =>
    structuredClone(endpoint.includes('/git/commits/') ? commit : pr)
  )
  const inspect = vi.fn(async () => ({
    state: 'passed',
    head: f.target,
    base: f.base,
    runId: 12,
    requiredChecks: []
  }))
  const run = vi.fn(async (spec) => {
    pr.merged = true
    pr.state = 'closed'
    pr.base.sha = commit.sha
    spec.onChildTerminated()
    return { code: 0, stdout: '', stderr: '', timedOut: false, outputTruncated: false }
  })
  const receipt = async () => JSON.parse(await readFile(join(folder, 'main-merge.json'), 'utf8'))
  return { f, pr, commit, read, inspect, run, receipt }
}
it('rejects a caller head or PR mismatch before remote operations', async () => {
  const s = await setup()
  await expect(
    mergeOrca34Sync({ ...s.f, apply: true, expectedHead: 'f'.repeat(40) }, s)
  ).rejects.toThrow()
  await expect(mergeOrca34Sync({ ...s.f, apply: true, expectedNumber: 99 }, s)).rejects.toThrow()
  expect(s.read).not.toHaveBeenCalled()
  expect(s.run).not.toHaveBeenCalled()
})
it('only checks by default, then merges the exact head once and reconciles repeats', async () => {
  const s = await setup()
  expect(await mergeOrca34Sync(s.f, s)).toMatchObject({ phase: 'ready' })
  expect(s.run).not.toHaveBeenCalled()
  expect(await mergeOrca34Sync({ ...s.f, apply: true }, s)).toMatchObject({
    phase: 'merged',
    commit: s.commit.sha
  })
  expect(s.run.mock.calls[0][0].args).toEqual([
    'pr',
    'merge',
    '42',
    '--repo',
    '34/orca',
    '--merge',
    '--match-head-commit',
    s.f.target
  ])
  expect(await mergeOrca34Sync({ ...s.f, apply: true }, s)).toMatchObject({ phase: 'merged' })
  expect(s.run).toHaveBeenCalledTimes(1)
})
it.each(['pending', 'blocked'])(
  'never submits a merge when full admission is %s',
  async (state) => {
    const s = await setup()
    s.inspect.mockResolvedValue({ state, head: s.f.target, base: s.f.base })
    expect(await mergeOrca34Sync({ ...s.f, apply: true }, s)).toMatchObject({ phase: 'waiting' })
    expect(s.run).not.toHaveBeenCalled()
  }
)
it('recovers a lost successful response by reading the actual merge parents', async () => {
  const s = await setup()
  s.run.mockImplementation(async () => {
    s.pr.merged = true
    s.pr.state = 'closed'
    throw new Error('connection lost')
  })
  await expect(mergeOrca34Sync({ ...s.f, apply: true }, s)).rejects.toThrow('connection lost')
  expect(await s.receipt()).toMatchObject({ phase: 'unverifiable' })
  expect(await mergeOrca34Sync(s.f, s)).toMatchObject({ phase: 'merged', commit: s.commit.sha })
  expect(s.run).toHaveBeenCalledTimes(1)
})
it('does not resubmit an uncertain open request even if the caller asks to apply', async () => {
  const s = await setup()
  s.run.mockResolvedValue({ code: 0 })
  await expect(mergeOrca34Sync({ ...s.f, apply: true }, s)).rejects.toThrow('child exit')
  await expect(mergeOrca34Sync({ ...s.f, apply: true }, s)).rejects.toThrow('Previous merge')
  expect(s.run).toHaveBeenCalledTimes(1)
})
it('rejects a head or base change before the write', async () => {
  const s = await setup()
  s.inspect.mockImplementation(async () => {
    s.pr.head.sha = 'd'.repeat(40)
    return { state: 'passed', head: s.f.target, base: s.f.base }
  })
  await expect(mergeOrca34Sync({ ...s.f, apply: true }, s)).rejects.toThrow('head changed')
  expect(s.run).not.toHaveBeenCalled()
  s.pr.head.sha = s.f.target
  s.pr.base.sha = 'd'.repeat(40)
  await expect(mergeOrca34Sync({ ...s.f, apply: true }, s)).rejects.toThrow('base changed')
})
it('does not treat a merge with different parents as completion', async () => {
  const s = await setup()
  s.commit.parents[0].sha = 'e'.repeat(40)
  await expect(mergeOrca34Sync({ ...s.f, apply: true }, s)).rejects.toThrow('different parents')
  expect(await s.receipt()).toMatchObject({ phase: 'unverifiable' })
})

it('rechecks merged CI using the recorded admission and actual merge identity', async () => {
  const s = await setup()
  await mergeOrca34Sync({ ...s.f, apply: true }, s)
  const inspectWorkflow = vi.fn(async (_number, head) => ({
    state: 'passed',
    head,
    base: s.f.base
  }))
  expect(await inspectOrca34MergedSync(s.f, { read: s.read, inspectWorkflow })).toMatchObject({
    state: 'passed',
    mergeCommit: s.commit.sha
  })
  expect(inspectWorkflow).toHaveBeenCalledWith(42, s.f.target, s.read, {
    merged: { base: s.f.base, commit: s.commit.sha }
  })
  inspectWorkflow.mockResolvedValueOnce({ state: 'blocked', head: s.f.target, base: s.f.base })
  expect(await inspectOrca34MergedSync(s.f, { read: s.read, inspectWorkflow })).toMatchObject({
    state: 'blocked'
  })
  expect(s.run).toHaveBeenCalledTimes(1)
})
