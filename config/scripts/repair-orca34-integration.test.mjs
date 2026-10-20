import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { repairOrca34Integration, inspectRepairMerge } from './repair-orca34-integration.mjs'

const head = 'a'.repeat(40)
const target = 'b'.repeat(40)
const roots = []
const success = { code: 0, stdout: 'resolved', stderr: '', timedOut: false }
const merge = { branch: 'codex/test-repair', unmerged: '' }
async function fixture() {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'orca34-repair-')))
  roots.push(directory)
  const input = { directory, head, target }
  const receipt = join(directory, 'repairs', `${head}-${target}`, 'repair.json')
  return { input, receipt }
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})
function runner() {
  return vi.fn(async (spec) => {
    spec.onChildTerminated?.()
    return success
  })
}

it('persists the attempt before launch, validates the merge, and never commits or publishes', async () => {
  const { input, receipt } = await fixture()
  const run = runner()
  run.mockImplementationOnce(async (spec) => {
    expect(JSON.parse(await readFile(receipt, 'utf8')).attempts).toMatchObject([
      { phase: 'running' }
    ])
    expect(spec.program).toBe('codex')
    expect(spec.args).toContain('--approve-for-me')
    expect(spec.args).not.toContain('--sandbox')
    expect(spec.args).not.toContain('--dangerously-bypass-approvals-and-sandbox')
    expect(spec.input).toContain(head)
    expect(spec.input).toContain(target)
    expect(spec.input).toContain('Do not commit, push')
    expect(spec.env.ORCA_BACKGROUND_LAUNCH).toBe('1')
    spec.onChildTerminated()
    return success
  })
  const inspect = vi.fn().mockResolvedValue(merge)
  expect(await repairOrca34Integration(input, { run, inspect })).toMatchObject({
    phase: 'awaiting-review-and-full-ci',
    attempts: [{ phase: 'resolved' }]
  })
  expect(run.mock.calls.map(([spec]) => spec.program)).toEqual([
    'codex',
    'git',
    'git',
    'pnpm',
    'pnpm'
  ])
  await repairOrca34Integration(input, { run, inspect })
  expect(run).toHaveBeenCalledTimes(5)
})

it('persists and enforces the three-attempt budget across calls', async () => {
  const { input, receipt } = await fixture()
  const run = runner()
  run.mockImplementation(async (spec) => {
    spec.onChildTerminated()
    return { ...success, code: 1 }
  })
  const options = { run, inspect: async () => merge }
  for (let round = 0; round < 3; round++) {
    await expect(repairOrca34Integration(input, options)).rejects.toThrow('Agent repair failed')
  }
  await expect(repairOrca34Integration(input, options)).rejects.toThrow('Three repair attempts')
  expect(run).toHaveBeenCalledTimes(3)
  expect(JSON.parse(await readFile(receipt, 'utf8')).attempts).toHaveLength(3)
})

it.each([0, 1])('does not retry an unverifiable child at operation %s', async (unknownAt) => {
  const { input, receipt } = await fixture()
  let index = 0
  const run = vi.fn(async (spec) => {
    if (index++ !== unknownAt) {
      spec.onChildTerminated()
    }
    return success
  })
  const options = { run, inspect: async () => merge }
  await expect(repairOrca34Integration(input, options)).rejects.toThrow('exit is unverifiable')
  expect(JSON.parse(await readFile(receipt, 'utf8')).phase).toBe('unverifiable')
  const calls = run.mock.calls.length
  await expect(repairOrca34Integration(input, options)).rejects.toThrow('Interrupted repair')
  expect(run).toHaveBeenCalledTimes(calls)
})

it('retains unresolved files and blocks a concurrent repair under the release lease', async () => {
  const { input } = await fixture()
  const run = runner()
  const inspect = async () => ({ ...merge, unmerged: 'source.ts' })
  run.mockImplementationOnce(async (spec) => {
    await expect(repairOrca34Integration(input, { run, inspect })).rejects.toThrow()
    spec.onChildTerminated()
    return success
  })
  await expect(repairOrca34Integration(input, { run, inspect })).rejects.toThrow('unresolved files')
  expect(run).toHaveBeenCalledTimes(1)
})

it('rejects merge identity changes and non-isolated branches', async () => {
  for (const values of [
    [target],
    [head, target],
    [head, head, head],
    [head, head, target, 'main']
  ]) {
    const run = async () => ({ ...success, stdout: values.shift() })
    await expect(inspectRepairMerge('/unused', head, target, run)).rejects.toThrow()
  }
  const values = [head, head, target, 'codex/repair', 'conflicted.ts']
  expect(
    await inspectRepairMerge('/unused', head, target, async () => ({
      ...success,
      stdout: values.shift()
    }))
  ).toEqual({ branch: 'codex/repair', unmerged: 'conflicted.ts' })
})
