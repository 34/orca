import { afterEach, expect, it } from 'vitest'
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prepareOrca34Candidate } from './prepare-orca34-candidate.mjs'
import { withUpstreamReleaseLease } from './orca34-upstream-record.mjs'

const roots = []
const commit = 'a'.repeat(40)
const release = {
  repository: 'stablyai/orca',
  tag: 'v1.4.232',
  commit: 'b'.repeat(40),
  releaseId: 123,
  publishedAt: '2026-10-20T06:20:47Z',
  url: 'https://github.com/stablyai/orca/releases/tag/v1.4.232'
}
const passed = {
  state: 'passed',
  head: commit,
  base: 'c'.repeat(40),
  runId: 42,
  attempt: 1,
  reason: 'full-workflow-successful'
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})
async function fixture() {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'orca34-candidate-')))
  roots.push(directory)
  const request = { directory, number: 2, commit }
  const calls = []
  const dependencies = {
    discover: async () => release,
    inspect: async () => passed,
    assertSource: () => {},
    verify: async () => {},
    build: async ({ output, expectedCommit }) => {
      calls.push(output)
      return { commit: expectedCommit, candidate: join(output, 'mac-arm64', 'Orca 34.app') }
    }
  }
  const read = async () =>
    JSON.parse(await readFile(join(directory, 'candidates', commit, 'candidate.json'), 'utf8'))
  return { request, calls, dependencies, read }
}

it('waits for full CI and resumes to one verified build without rebuilding on repeat', async () => {
  const { request, calls, dependencies, read } = await fixture()
  const inspect = dependencies.inspect
  dependencies.inspect = async () => ({ ...passed, state: 'pending' })
  expect((await prepareOrca34Candidate(request, dependencies)).phase).toBe('waiting')
  expect(calls).toEqual([])
  dependencies.inspect = inspect
  expect((await prepareOrca34Candidate(request, dependencies)).phase).toBe('verified')
  expect((await prepareOrca34Candidate(request, dependencies)).phase).toBe('verified')
  expect(calls).toHaveLength(1)
  expect((await read()).evidence).toEqual(passed)
})

it('keeps interrupted build output and allocates a fresh attempt on retry', async () => {
  const { request, calls, dependencies, read } = await fixture()
  const build = dependencies.build
  dependencies.build = async (args) => {
    await build(args)
    throw new Error('build interrupted')
  }
  await expect(prepareOrca34Candidate(request, dependencies)).rejects.toThrow('interrupted')
  const interrupted = await read()
  expect(interrupted.phase).toBe('failed')
  dependencies.build = build
  expect((await prepareOrca34Candidate(request, dependencies)).phase).toBe('verified')
  expect(calls).toHaveLength(2)
  expect(calls[1]).not.toBe(calls[0])
  expect(await realpath(interrupted.output)).toBe(interrupted.output)
})

it('rejects a changed PR base after building and rechecks without another build', async () => {
  const { request, calls, dependencies, read } = await fixture()
  let reads = 0
  dependencies.inspect = async () => (++reads === 1 ? passed : { ...passed, base: 'd'.repeat(40) })
  await expect(prepareOrca34Candidate(request, dependencies)).rejects.toThrow('CI evidence changed')
  expect((await read()).phase).toBe('failed')
  expect((await prepareOrca34Candidate(request, dependencies)).phase).toBe('verified')
  expect(calls).toHaveLength(1)
})

it('revokes verified status while the exact head is being rechecked', async () => {
  const { request, calls, dependencies } = await fixture()
  await prepareOrca34Candidate(request, dependencies)
  dependencies.inspect = async () => ({ ...passed, state: 'pending', attempt: 2 })
  expect(await prepareOrca34Candidate(request, dependencies)).toMatchObject({
    phase: 'waiting',
    notice: { kind: 'candidate-ready', active: false }
  })
  expect(calls).toHaveLength(1)
})

it('refuses a previously verified candidate whose on-disk identity no longer validates', async () => {
  const { request, calls, dependencies, read } = await fixture()
  await prepareOrca34Candidate(request, dependencies)
  dependencies.verify = async () => {
    throw new Error('candidate signature invalid')
  }
  await expect(prepareOrca34Candidate(request, dependencies)).rejects.toThrow('signature invalid')
  expect((await read()).phase).toBe('failed')
  expect(calls).toHaveLength(1)
})

it('persists source validation failures and never starts a build', async () => {
  const { request, calls, dependencies, read } = await fixture()
  dependencies.assertSource = () => {
    throw new Error('source changed')
  }
  await expect(prepareOrca34Candidate(request, dependencies)).rejects.toThrow('source changed')
  expect(await read()).toMatchObject({ phase: 'failed', error: 'source changed' })
  expect(calls).toEqual([])
})

it('records offline discovery failures, deduplicates notices and reports recovery', async () => {
  const { request, calls, dependencies, read } = await fixture()
  const discover = dependencies.discover
  dependencies.discover = async () => {
    throw new Error('GitHub offline')
  }
  await expect(prepareOrca34Candidate(request, dependencies)).rejects.toThrow('offline')
  const failed = await read()
  expect(failed).toMatchObject({
    phase: 'failed',
    notice: { sequence: 1, kind: 'failed', message: 'GitHub offline' }
  })
  await expect(prepareOrca34Candidate(request, dependencies)).rejects.toThrow('offline')
  expect((await read()).notice).toEqual(failed.notice)
  expect(calls).toEqual([])
  dependencies.discover = discover
  expect((await prepareOrca34Candidate(request, dependencies)).notice).toMatchObject({
    sequence: 2,
    kind: 'candidate-ready'
  })
  const recovered = (await read()).notice
  await prepareOrca34Candidate(request, dependencies)
  expect((await read()).notice).toEqual(recovered)
})

it('leaves pending checks quiet and records a blocked result once', async () => {
  const { request, dependencies, read } = await fixture()
  dependencies.inspect = async () => ({ ...passed, state: 'pending' })
  expect((await prepareOrca34Candidate(request, dependencies)).notice).toBeUndefined()
  dependencies.inspect = async () => ({
    ...passed,
    state: 'blocked',
    reason: 'workflow-not-successful'
  })
  expect((await prepareOrca34Candidate(request, dependencies)).notice).toMatchObject({
    sequence: 1,
    kind: 'checks-blocked'
  })
  const notice = (await read()).notice
  await prepareOrca34Candidate(request, dependencies)
  expect((await read()).notice).toEqual(notice)
})

it('rejects source changes during the build and does not mark the candidate built', async () => {
  const { request, dependencies, read } = await fixture()
  let checks = 0
  dependencies.assertSource = () => {
    if (++checks > 1) {
      throw new Error('source changed during build')
    }
  }
  await expect(prepareOrca34Candidate(request, dependencies)).rejects.toThrow('during build')
  expect(await read()).toMatchObject({ phase: 'failed' })
  expect((await read()).built).toBeUndefined()
})

it('refuses concurrent runs and a different PR bound to the same candidate commit', async () => {
  const { request, dependencies } = await fixture()
  await withUpstreamReleaseLease(request.directory, async () => {
    await expect(prepareOrca34Candidate(request, dependencies)).rejects.toThrow()
  })
  await prepareOrca34Candidate(request, dependencies)
  await expect(prepareOrca34Candidate({ ...request, number: 3 }, dependencies)).rejects.toThrow(
    'number changed'
  )
})
