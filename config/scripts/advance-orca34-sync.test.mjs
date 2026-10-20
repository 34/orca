import { expect, it, vi } from 'vitest'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { runProcess } from '@orca/process-host'
import { fixture, git } from './orca34-sync-test-fixture.mjs'
import { advanceOrca34Sync } from './advance-orca34-sync.mjs'
const body =
  '## ELI5\nSync.\n## What Changed\nOfficial updates.\n## Why\nKeep current.\n## Testing\nFull CI pending.\n'
function dependencies(f) {
  const run = vi.fn(async (spec) => {
    if (spec.program !== 'pnpm') {
      return runProcess(spec)
    }
    spec.onChildTerminated?.()
    return { code: 0, stdout: '', stderr: '', timedOut: false, outputTruncated: false }
  })
  const publish = vi.fn(async () => ({
    phase: 'published',
    number: 42,
    url: 'https://github.com/34/orca/pull/42',
    identity: { head: await git(f.source, ['rev-parse', 'HEAD']), baseCommit: f.base }
  }))
  const inspect = vi.fn(async (_number, head) => ({
    state: 'passed',
    head,
    base: f.base,
    reason: 'full-workflow-and-merge-policy-successful'
  }))
  return { run, publish, inspect }
}
it('runs real merge/commit once and resumes waiting CI without rebuilding the merge', async () => {
  const f = { ...(await fixture()), body }
  const deps = dependencies(f)
  deps.inspect.mockImplementationOnce(async (_number, head) => ({
    state: 'pending',
    head,
    base: f.base,
    reason: 'workflow-incomplete'
  }))
  const waiting = await advanceOrca34Sync(f, deps)
  expect(waiting.phase).toBe('waiting')
  const ready = await advanceOrca34Sync(f, deps)
  expect(ready).toMatchObject({ phase: 'ready', head: waiting.head, number: 42 })
  expect(deps.run.mock.calls.filter(([s]) => s.args[0] === 'merge')).toHaveLength(1)
  expect(deps.run.mock.calls.filter(([s]) => s.args[0] === 'commit')).toHaveLength(1)
  expect(deps.run.mock.calls.filter(([s]) => s.program === 'pnpm')).toHaveLength(3)
})
it('resolves a real conflict through the bounded repair entry before committing', async () => {
  const f = { ...(await fixture(true)), body }
  const deps = dependencies(f)
  const original = deps.run.getMockImplementation()
  deps.run.mockImplementation(async (spec) => {
    if (spec.program !== 'codex') {
      return original(spec)
    }
    expect(spec.cwd).toBe(f.source)
    await writeFile(join(f.source, 'settings.txt'), 'fork and official\n')
    await git(f.source, ['add', 'settings.txt'])
    spec.onChildTerminated?.()
    return { code: 0, stdout: '', stderr: '', timedOut: false, outputTruncated: false }
  })
  expect(await advanceOrca34Sync(f, deps)).toMatchObject({ phase: 'ready' })
  expect(deps.run.mock.calls.filter(([s]) => s.program === 'codex')).toHaveLength(1)
  expect(await readFile(join(f.source, 'settings.txt'), 'utf8')).toBe('fork and official\n')
})
it('records publication failure and retries the same committed candidate', async () => {
  const f = { ...(await fixture()), body }
  const deps = dependencies(f)
  deps.publish.mockRejectedValueOnce(new Error('offline'))
  await expect(advanceOrca34Sync(f, deps)).rejects.toThrow('offline')
  const head = await git(f.source, ['rev-parse', 'HEAD'])
  const failed = JSON.parse(
    await readFile(join(f.directory, 'sync', f.tag, 'main-run.json'), 'utf8')
  )
  expect(failed).toMatchObject({
    phase: 'failed',
    notice: { kind: 'failed', phase: 'publishing', message: 'offline' }
  })
  expect(await advanceOrca34Sync(f, deps)).toMatchObject({ phase: 'ready', head, notice: null })
  expect(deps.run.mock.calls.filter(([s]) => s.args[0] === 'commit')).toHaveLength(1)
})
it('rejects evidence for another head instead of marking the candidate ready', async () => {
  const f = { ...(await fixture()), body }
  const deps = dependencies(f)
  deps.inspect.mockResolvedValue({ state: 'passed', head: 'a'.repeat(40), base: f.base })
  await expect(advanceOrca34Sync(f, deps)).rejects.toThrow('different head')
})
it('records blocked CI for notification without merging or rebuilding', async () => {
  const f = { ...(await fixture()), body }
  const deps = dependencies(f)
  deps.inspect.mockImplementation(async (_number, head) => ({
    state: 'blocked',
    head,
    base: f.base,
    reason: 'workflow-not-successful'
  }))
  expect(await advanceOrca34Sync(f, deps)).toMatchObject({
    phase: 'waiting',
    notice: { kind: 'checks-blocked', message: 'workflow-not-successful' }
  })
})
it('serializes concurrent runners across the individual stage locks', async () => {
  const f = { ...(await fixture()), body }
  const deps = dependencies(f)
  let release, entered
  const gate = new Promise((resolve) => {
    release = resolve
  })
  const started = new Promise((resolve) => {
    entered = resolve
  })
  const publish = async (...args) => {
    entered()
    await gate
    return deps.publish(...args)
  }
  const first = advanceOrca34Sync(f, { ...deps, publish })
  await started
  try {
    await expect(advanceOrca34Sync(f, deps)).rejects.toThrow()
  } finally {
    release()
  }
  expect(await first).toMatchObject({ phase: 'ready' })
  expect(deps.publish).toHaveBeenCalledTimes(1)
})

it('does not reset the repair budget when the runner is retriggered', async () => {
  const f = { ...(await fixture(true)), body }
  const deps = dependencies(f)
  const original = deps.run.getMockImplementation()
  deps.run.mockImplementation(async (spec) => {
    if (spec.program !== 'codex') {
      return original(spec)
    }
    spec.onChildTerminated?.()
    return { code: 1, stdout: '', stderr: 'failed', timedOut: false, outputTruncated: false }
  })
  for (let attempt = 0; attempt < 3; attempt++) {
    await expect(advanceOrca34Sync(f, deps)).rejects.toThrow('Agent repair failed')
  }
  await expect(advanceOrca34Sync(f, deps)).rejects.toThrow('Three repair attempts exhausted')
  expect(deps.run.mock.calls.filter(([s]) => s.program === 'codex')).toHaveLength(3)
  expect(deps.publish).not.toHaveBeenCalled()
  expect(await git(f.source, ['rev-parse', 'HEAD'])).toBe(f.base)
})

it('resumes local candidate preparation and revokes its pointer when CI changes', async () => {
  const f = { ...(await fixture()), body, stage: 'local', mainPr: 1 }
  f.mainCommit = f.target
  const deps = dependencies(f)
  const candidate = vi.fn(async (request) => ({
    ...request,
    phase: 'verified',
    candidate: join(f.directory, 'candidate.app')
  }))
  candidate.mockRejectedValueOnce(new Error('build failed'))
  await expect(advanceOrca34Sync(f, { ...deps, candidate })).rejects.toThrow('build failed')
  const head = await git(f.source, ['rev-parse', 'HEAD'])
  expect(await advanceOrca34Sync(f, { ...deps, candidate })).toMatchObject({
    phase: 'candidate-ready',
    head,
    candidate: join(f.directory, 'candidate.app')
  })
  expect(candidate).toHaveBeenLastCalledWith({
    directory: f.directory,
    source: f.source,
    number: 42,
    commit: head
  })
  expect(deps.run.mock.calls.filter(([s]) => s.args[0] === 'commit')).toHaveLength(1)
  deps.inspect.mockImplementation(async (_number, head) => ({
    state: 'pending',
    head,
    base: f.base,
    reason: 'workflow-incomplete'
  }))
  const waiting = await advanceOrca34Sync(f, { ...deps, candidate })
  expect(waiting.phase).toBe('waiting')
  expect(waiting.candidate).toBeUndefined()
  expect(candidate).toHaveBeenCalledTimes(2)
})

it('does not declare a local artifact ready if its build admission changes', async () => {
  const f = { ...(await fixture()), body, stage: 'local', mainPr: 1 }
  f.mainCommit = f.target
  const deps = dependencies(f)
  const candidate = async (request) => ({ ...request, phase: 'waiting' })
  const result = await advanceOrca34Sync(f, { ...deps, candidate })
  expect(result.phase).toBe('waiting')
  expect(result.candidate).toBeUndefined()
  await expect(
    advanceOrca34Sync(f, {
      ...deps,
      candidate: async (request) => ({ ...request, phase: 'verified', commit: 'a'.repeat(40) })
    })
  ).rejects.toThrow('different candidate commit')
})
