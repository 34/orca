import { expect, it, vi } from 'vitest'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { runProcess } from '@orca/process-host'
import { fixture, git } from './orca34-sync-test-fixture.mjs'
import { prepareOrca34Sync } from './prepare-orca34-sync.mjs'
import { commitOrca34Sync } from './commit-orca34-sync.mjs'
const passed = { code: 0, stdout: '', stderr: '', timedOut: false, outputTruncated: false }
function runner(check = async () => passed) {
  return vi.fn(async (spec) => {
    if (spec.program !== 'pnpm') {
      return runProcess(spec)
    }
    const result = await check(spec)
    spec.onChildTerminated?.()
    return result
  })
}
it('commits the verified staged tree with exactly the planned parents and deduplicates', async () => {
  const f = await fixture()
  await prepareOrca34Sync(f)
  const run = runner()
  const result = await commitOrca34Sync(f, { run })
  expect(result.phase).toBe('committed')
  expect(await git(f.source, ['show', '-s', '--format=%P', 'HEAD'])).toBe(`${f.base} ${f.target}`)
  const committed = await git(f.source, ['rev-parse', 'HEAD'])
  const again = await commitOrca34Sync(f, { run })
  expect(again.commit).toBe(committed)
  expect(run.mock.calls.filter(([s]) => s.args?.[0] === 'commit')).toHaveLength(1)
  expect(run.mock.calls.filter(([s]) => s.program === 'pnpm').map(([s]) => s.args)).toEqual([
    ['install', '--frozen-lockfile', '--reporter=append-only'],
    ['tc'],
    ['run', 'check:code-quality:changed', f.base]
  ])
})
it('does not commit failed validation and permits a corrected staged tree on retry', async () => {
  const f = await fixture()
  await prepareOrca34Sync(f)
  await expect(
    commitOrca34Sync(f, { run: runner(async () => ({ ...passed, code: 1 })) })
  ).rejects.toThrow('validation failed')
  expect(await git(f.source, ['rev-parse', 'HEAD'])).toBe(f.base)
  await writeFile(join(f.source, 'fork.txt'), 'corrected fork\n')
  await git(f.source, ['add', 'fork.txt'])
  expect(await commitOrca34Sync(f, { run: runner() })).toMatchObject({
    phase: 'committed',
    attempts: 2
  })
})
it('detects a staged change during validation before committing', async () => {
  const f = await fixture()
  await prepareOrca34Sync(f)
  await expect(
    commitOrca34Sync(f, {
      run: runner(async () => {
        await writeFile(join(f.source, 'fork.txt'), 'unexpected\n')
        await git(f.source, ['add', 'fork.txt'])
        return passed
      })
    })
  ).rejects.toThrow('Staged content changed')
  expect(await git(f.source, ['rev-parse', 'HEAD'])).toBe(f.base)
})
it('does not commit unstaged user edits or untracked files', async () => {
  const f = await fixture()
  await prepareOrca34Sync(f)
  await writeFile(join(f.source, 'user.txt'), 'keep')
  await expect(commitOrca34Sync(f, { run: runner() })).rejects.toThrow('Untracked')
  expect(await readFile(join(f.source, 'user.txt'), 'utf8')).toBe('keep')
})
it('retains the finite validation budget', async () => {
  const f = await fixture()
  await prepareOrca34Sync(f)
  const run = runner(async () => ({ ...passed, code: 1 }))
  for (let attempt = 0; attempt < 3; attempt++) {
    await expect(commitOrca34Sync(f, { run })).rejects.toThrow('validation failed')
  }
  await expect(commitOrca34Sync(f, { run })).rejects.toThrow('Three validation attempts')
  expect(await git(f.source, ['rev-parse', 'HEAD'])).toBe(f.base)
})
it('refuses to repeat a validation whose child termination is unknown', async () => {
  const f = await fixture()
  await prepareOrca34Sync(f)
  const run = async (spec) => (spec.program === 'pnpm' ? passed : runProcess(spec))
  await expect(commitOrca34Sync(f, { run })).rejects.toThrow('unverifiable')
  await expect(commitOrca34Sync(f, { run: runner() })).rejects.toThrow('unverifiable')
})

it('refuses to commit if validation changes the checked-out branch', async () => {
  const f = await fixture()
  await prepareOrca34Sync(f)
  await expect(
    commitOrca34Sync(f, {
      run: runner(async () => {
        await git(f.source, ['symbolic-ref', 'HEAD', 'refs/heads/original'])
        return passed
      })
    })
  ).rejects.toThrow()
  expect(await git(f.source, ['rev-parse', 'original'])).toBe(f.base)
})

it('stops before typecheck and commit when frozen dependency installation fails', async () => {
  const f = await fixture()
  await prepareOrca34Sync(f)
  const run = runner(async (spec) => {
    expect(spec.args).toEqual(['install', '--frozen-lockfile', '--reporter=append-only'])
    expect(spec.cwd).toBe(f.source)
    expect(spec.env.ORCA_BACKGROUND_LAUNCH).toBe('1')
    return { ...passed, code: 1, stderr: 'lockfile does not match manifests' }
  })
  await expect(commitOrca34Sync(f, { run })).rejects.toThrow('validation failed')
  expect(run.mock.calls.filter(([s]) => s.program === 'pnpm')).toHaveLength(1)
  expect(await git(f.source, ['rev-parse', 'HEAD'])).toBe(f.base)
})
