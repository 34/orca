import { expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { runProcess } from '@orca/process-host'
import { fixture, git } from './orca34-sync-test-fixture.mjs'
import { advanceOrca34Sync } from './advance-orca34-sync.mjs'
import { advanceOrca34Release } from './advance-orca34-release.mjs'

async function setup() {
  const f = await fixture()
  await git(f.source, ['tag', f.tag, f.target])
  const plan = vi.fn(async () =>
    JSON.parse(await readFile(join(f.directory, 'sync', f.tag, 'plan.json'), 'utf8'))
  )
  const run = vi.fn(async (spec) => {
    const args = [...spec.args]
    if (args[0] === 'fetch' && args[2].startsWith('https:')) {
      if (args[2] === 'https://github.com/34/orca.git') {
        args[3] = 'refs/heads/original'
      } else {
        expect(args[2]).toBe('https://github.com/stablyai/orca.git')
      }
      args[2] = f.source
    }
    return runProcess({ ...spec, args })
  })
  let head
  const advance = vi.fn(async (input) => {
    expect(input.body).toContain(`## ELI5\nBring official ${f.tag}`)
    if (input.stage === 'main') {
      if (!head) {
        await git(input.source, ['config', 'user.name', 'Fixture'])
        await git(input.source, ['config', 'user.email', 'fixture@example.invalid'])
        await git(input.source, [
          '-c',
          'commit.gpgSign=false',
          'merge',
          '--no-ff',
          f.target,
          '-m',
          'main candidate'
        ])
        head = await git(input.source, ['rev-parse', 'HEAD'])
      }
      return { phase: 'ready', head, number: 42 }
    }
    expect(input.mainCommit).toBe(head)
    expect(input.mainPr).toBe(42)
    expect(await git(input.source, ['cat-file', '-t', head])).toBe('commit')
    expect(await git(input.source, ['rev-parse', 'HEAD'])).toBe(f.base)
    return { phase: 'candidate-ready', candidate: join(f.directory, 'candidate.app') }
  })
  const receipt = async () =>
    JSON.parse(await readFile(join(f.directory, 'release-run.json'), 'utf8'))
  return { f, plan, run, advance, receipt }
}
it('waits for main CI then imports its exact commit into local and resumes without another fetch', async () => {
  const s = await setup()
  s.advance.mockResolvedValueOnce({ phase: 'waiting' })
  expect(await advanceOrca34Release(s.f.directory, s)).toMatchObject({ phase: 'waiting-main' })
  expect(s.advance).toHaveBeenCalledTimes(1)
  expect(await advanceOrca34Release(s.f.directory, s)).toMatchObject({ phase: 'candidate-ready' })
  const count = s.run.mock.calls.filter(([spec]) => spec.args[0] === 'fetch').length
  expect(count).toBe(5)
  expect(await advanceOrca34Release(s.f.directory, s)).toMatchObject({ phase: 'candidate-ready' })
  expect(s.run.mock.calls.filter(([spec]) => spec.args[0] === 'fetch')).toHaveLength(count)
  expect(s.run.mock.calls.every(([spec]) => !['push', 'reset'].includes(spec.args[0]))).toBe(true)
})
it('retains the main result when local fails and resumes with the same head', async () => {
  const s = await setup()
  const original = s.advance.getMockImplementation()
  let failed = false
  s.advance.mockImplementation(async (input) => {
    if (input.stage === 'local' && !failed) {
      failed = true
      throw new Error('local failed')
    }
    return original(input)
  })
  await expect(advanceOrca34Release(s.f.directory, s)).rejects.toThrow('local failed')
  const saved = await s.receipt()
  expect(saved).toMatchObject({ phase: 'failed', notice: { phase: 'local' } })
  expect(await advanceOrca34Release(s.f.directory, s)).toMatchObject({
    phase: 'candidate-ready',
    main: { head: saved.main.head }
  })
})
it('records offline discovery without preparing sources', async () => {
  const s = await setup()
  s.plan.mockRejectedValue(new Error('offline'))
  await expect(advanceOrca34Release(s.f.directory, s)).rejects.toThrow('offline')
  expect(await s.receipt()).toMatchObject({
    phase: 'failed',
    notice: { phase: 'discovering', message: 'offline' }
  })
  expect(s.run).not.toHaveBeenCalled()
})
it('does not retry an unconfirmed main fetch', async () => {
  const s = await setup()
  const original = s.run.getMockImplementation()
  s.run.mockImplementation(async (spec) => {
    if (spec.args[0] === 'fetch' && !spec.args[2].startsWith('https:')) {
      return { code: 0 }
    }
    return original(spec)
  })
  await expect(advanceOrca34Release(s.f.directory, s)).rejects.toThrow('child exit')
  expect(await s.receipt()).toMatchObject({ phase: 'unverifiable' })
  const calls = s.run.mock.calls.length
  await expect(advanceOrca34Release(s.f.directory, s)).rejects.toThrow('Previous main fetch')
  expect(s.run).toHaveBeenCalledTimes(calls)
})
it('serializes the whole flow while a stage is running', async () => {
  const s = await setup()
  let release, entered
  const gate = new Promise((resolve) => {
    release = resolve
  })
  const started = new Promise((resolve) => {
    entered = resolve
  })
  s.advance.mockImplementationOnce(async () => {
    entered()
    await gate
    return { phase: 'waiting' }
  })
  const first = advanceOrca34Release(s.f.directory, s)
  await started
  try {
    await expect(advanceOrca34Release(s.f.directory, s)).rejects.toThrow()
  } finally {
    release()
  }
  expect(await first).toMatchObject({ phase: 'waiting-main' })
})

it('composes both real merge and commit stages with isolated sources', async () => {
  const s = await setup()
  const originalRun = s.run.getMockImplementation()
  s.run.mockImplementation(async (spec) => {
    if (spec.program !== 'pnpm') {
      return originalRun(spec)
    }
    spec.onChildTerminated?.()
    return { code: 0, stdout: '', stderr: '', timedOut: false, outputTruncated: false }
  })
  s.advance.mockImplementation(async (input) => {
    await git(input.source, ['config', 'user.name', 'Fixture'])
    await git(input.source, ['config', 'user.email', 'fixture@example.invalid'])
    await git(input.source, ['config', 'commit.gpgSign', 'false'])
    return advanceOrca34Sync(input, {
      run: s.run,
      publish: async () => ({
        phase: 'published',
        number: input.stage === 'main' ? 42 : 43,
        identity: { head: await git(input.source, ['rev-parse', 'HEAD']), baseCommit: s.f.base }
      }),
      inspect: async (_number, head) => ({ state: 'passed', head, base: s.f.base }),
      candidate: async (request) => ({
        ...request,
        phase: 'verified',
        candidate: join(s.f.directory, 'candidate.app')
      })
    })
  })
  const result = await advanceOrca34Release(s.f.directory, s)
  expect(result.phase).toBe('candidate-ready')
  const mainSource = s.advance.mock.calls[0][0].source
  const localSource = s.advance.mock.calls[1][0].source
  expect(await git(mainSource, ['show', '-s', '--format=%P', 'HEAD'])).toBe(
    `${s.f.base} ${s.f.target}`
  )
  expect(await git(localSource, ['show', '-s', '--format=%P', 'HEAD'])).toBe(
    `${s.f.base} ${result.main.head}`
  )
  expect(await advanceOrca34Release(s.f.directory, s)).toMatchObject({
    phase: 'candidate-ready',
    main: { head: result.main.head },
    local: { head: result.local.head }
  })
  expect(
    s.run.mock.calls.filter(([spec]) => spec.program === 'pnpm' && spec.args[0] === 'install')
  ).toHaveLength(2)
}, 30000)
