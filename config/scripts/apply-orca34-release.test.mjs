import { expect, it, vi } from 'vitest'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fixture } from './orca34-sync-test-fixture.mjs'
import { applyOrca34Release } from './apply-orca34-release.mjs'

async function setup() {
  const f = await fixture()
  const target = join(dirname(f.directory), 'installed.app')
  const profile = join(dirname(f.directory), 'profile')
  const candidate = join(f.directory, 'candidate.app')
  for (const path of [target, profile, candidate]) {
    await mkdir(path)
  }
  const release = {
    schemaVersion: 1,
    directory: f.directory,
    tag: f.tag,
    phase: 'candidate-ready',
    main: { head: f.target, number: 42 },
    local: { head: f.base, number: 43 },
    candidate
  }
  await writeFile(join(f.directory, 'release-run.json'), JSON.stringify(release))
  const merged = new Set()
  const merge = vi.fn(async ({ stage, apply, expectedHead, expectedNumber }) => {
    expect(expectedHead).toBe(release[stage].head)
    expect(expectedNumber).toBe(release[stage].number)
    if (apply) {
      merged.add(stage)
    }
    return { identity: release[stage], phase: merged.has(stage) ? 'merged' : 'ready' }
  })
  let delivery
  const readDelivery = vi.fn(async () => {
    if (!delivery) {
      throw Object.assign(new Error('missing'), { code: 'ENOENT' })
    }
    return delivery
  })
  const deliver = vi.fn(async ([command, directory]) => {
    expect(command).toBe(delivery ? 'resume' : 'candidate')
    delivery = {
      directory,
      candidateMode: true,
      candidate,
      target,
      profile,
      commit: f.base,
      phase: 'healthy'
    }
    return delivery
  })
  const verify = vi.fn()
  const inspectMerged = vi.fn(async ({ stage }) => ({ ...release[stage], state: 'passed' }))
  const receipt = async () =>
    JSON.parse(await readFile(join(f.directory, 'sync', f.tag, 'application.json'), 'utf8'))
  return {
    f,
    input: { directory: f.directory, target, profile },
    release,
    merge,
    merged,
    deliver,
    readDelivery,
    verify,
    inspectMerged,
    receipt
  }
}

it('checks both exact heads, merges main then local and adopts the candidate; repeats resume', async () => {
  const s = await setup()
  expect(await applyOrca34Release(s.input, s)).toMatchObject({ phase: 'healthy' })
  expect(s.merge.mock.calls.map(([x]) => [x.stage, x.apply])).toEqual([
    ['main', false],
    ['local', false],
    ['main', true],
    ['local', true]
  ])
  expect(s.verify).toHaveBeenCalledWith(s.release.candidate, s.release.local.head)
  expect(s.deliver.mock.calls[0][0]).toEqual([
    'candidate',
    join(s.f.directory, `delivery-${s.f.tag}`),
    s.release.candidate,
    s.release.local.head,
    s.input.target,
    s.input.profile
  ])
  expect(await applyOrca34Release(s.input, s)).toMatchObject({ phase: 'healthy' })
  expect(s.deliver.mock.calls[1][0][0]).toBe('resume')
})

it('does not change main while local checks are pending', async () => {
  const s = await setup()
  const original = s.merge.getMockImplementation()
  s.merge.mockImplementation((input) =>
    input.stage === 'local' ? { identity: s.release.local, phase: 'waiting' } : original(input)
  )
  expect(await applyOrca34Release(s.input, s)).toMatchObject({ phase: 'waiting-local' })
  expect(s.merged.size).toBe(0)
  expect(s.deliver).not.toHaveBeenCalled()
})

it('records a partial merge and resumes without installing until both sides are merged', async () => {
  const s = await setup()
  const original = s.merge.getMockImplementation()
  s.merge.mockImplementation((input) => {
    if (input.stage === 'local' && input.apply) {
      throw new Error('merge response lost')
    }
    return original(input)
  })
  await expect(applyOrca34Release(s.input, s)).rejects.toThrow('merge response lost')
  expect(await s.receipt()).toMatchObject({ phase: 'failed', main: { phase: 'merged' } })
  expect(s.deliver).not.toHaveBeenCalled()
  s.merge.mockImplementation(original)
  expect(await applyOrca34Release(s.input, s)).toMatchObject({ phase: 'healthy' })
})

it('resumes an interrupted delivery instead of starting another transaction', async () => {
  const s = await setup()
  const original = s.deliver.getMockImplementation()
  s.deliver.mockImplementationOnce(async (args) => {
    await original(args)
    throw new Error('health interrupted')
  })
  await expect(applyOrca34Release(s.input, s)).rejects.toThrow('health interrupted')
  expect(await s.receipt()).toMatchObject({ error: { phase: 'installing' } })
  expect(await applyOrca34Release(s.input, s)).toMatchObject({ phase: 'healthy' })
  expect(s.deliver.mock.calls[1][0][0]).toBe('resume')
})

it('rejects an invalid candidate before any remote operation', async () => {
  const s = await setup()
  s.verify.mockImplementation(() => {
    throw new Error('wrong commit')
  })
  await expect(applyOrca34Release(s.input, s)).rejects.toThrow('wrong commit')
  expect(s.merge).not.toHaveBeenCalled()
})

it('blocks installation when a merged PR loses its historical CI evidence', async () => {
  const s = await setup()
  s.inspectMerged.mockResolvedValue({ ...s.release.main, state: 'blocked' })
  await expect(applyOrca34Release(s.input, s)).rejects.toThrow()
  expect(s.merged.has('main')).toBe(true)
  expect(s.merged.has('local')).toBe(false)
  expect(s.deliver).not.toHaveBeenCalled()
})

it('refuses a changed installation target on resume', async () => {
  const s = await setup()
  await applyOrca34Release(s.input, s)
  s.merge.mockClear()
  await expect(applyOrca34Release({ ...s.input, target: s.release.candidate }, s)).rejects.toThrow(
    'overlap'
  )
  expect(s.merge).not.toHaveBeenCalled()
})
