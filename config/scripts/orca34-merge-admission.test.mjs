import { expect, it, vi } from 'vitest'
import { inspectOrca34MergeAdmission, readMergeAdmissionJson } from './orca34-merge-admission.mjs'

const head = 'a'.repeat(40)
const base = 'b'.repeat(40)
const workflow = { head, base, state: 'passed', runId: 42, attempt: 1 }
const pull = {
  headRefOid: head,
  baseRefOid: base,
  mergeStateStatus: 'CLEAN',
  mergeable: 'MERGEABLE',
  reviewDecision: ''
}
const check = { name: 'required', state: 'SUCCESS', bucket: 'pass' }
function inspect({ checks = [check], before = pull, after = before, refreshed = workflow } = {}) {
  const responses = [before, checks, after]
  return inspectOrca34MergeAdmission(2, head, {
    read: async () => {
      if (!responses.length) {
        throw new Error('Unexpected request')
      }
      return responses.shift()
    },
    inspectWorkflow: vi.fn().mockResolvedValueOnce(workflow).mockResolvedValueOnce(refreshed)
  })
}

it('accepts exact full CI plus successful required checks and clean merge policy', async () => {
  expect(await inspect()).toMatchObject({ state: 'passed', head, base, requiredChecks: [check] })
  expect(await inspect({ checks: [] })).toMatchObject({ state: 'passed', requiredChecks: [] })
})

it.each([
  ['pending', 'PENDING', 'pending'],
  ['fail', 'FAILURE', 'blocked'],
  ['cancel', 'CANCELLED', 'blocked'],
  ['skipping', 'SKIPPED', 'blocked'],
  ['pass', 'NEUTRAL', 'blocked']
])('does not admit required %s checks', async (bucket, state, expected) => {
  expect(await inspect({ checks: [{ ...check, bucket, state }] })).toMatchObject({
    state: expected
  })
})

it.each([
  { mergeStateStatus: 'BLOCKED' },
  { mergeStateStatus: 'BEHIND' },
  { mergeStateStatus: 'UNKNOWN' },
  { mergeable: 'CONFLICTING' },
  { reviewDecision: 'REVIEW_REQUIRED' },
  { reviewDecision: 'CHANGES_REQUESTED' }
])('rejects unresolved repository policy %j', async (change) => {
  expect(await inspect({ before: { ...pull, ...change } })).toMatchObject({
    state: 'blocked',
    reason: 'repository-merge-policy-not-ready'
  })
})

it('rejects head/base movement and workflow reruns during inspection', async () => {
  await expect(inspect({ before: { ...pull, headRefOid: base } })).rejects.toThrow('head changed')
  await expect(inspect({ before: { ...pull, baseRefOid: head } })).rejects.toThrow('base changed')
  await expect(inspect({ after: { ...pull, mergeStateStatus: 'BLOCKED' } })).rejects.toThrow(
    'changed during inspection'
  )
  await expect(inspect({ refreshed: { ...workflow, attempt: 2 } })).rejects.toThrow(
    'workflow evidence changed'
  )
})

it('does not inspect merge policy before full workflow success', async () => {
  const read = vi.fn()
  expect(
    await inspectOrca34MergeAdmission(2, head, {
      inspectWorkflow: async () => ({ ...workflow, state: 'pending' }),
      read
    })
  ).toMatchObject({ state: 'pending', requiredChecks: null })
  expect(read).not.toHaveBeenCalled()
})

it('accepts CLI pending JSON and explicit no-required-checks, but fails closed on API errors', async () => {
  const args = ['checks', '2', '--required', '--json', 'name,state,bucket']
  const result = { code: 0, stdout: '[]', stderr: '', timedOut: false, outputTruncated: false }
  const pending = [{ ...check, bucket: 'pending', state: 'PENDING' }]
  const run = vi.fn().mockResolvedValue({ ...result, code: 8, stdout: JSON.stringify(pending) })
  expect(await readMergeAdmissionJson(args, run)).toEqual(pending)
  expect(run.mock.calls[0][0].args).toEqual(['pr', ...args, '--repo', '34/orca'])
  expect(
    await readMergeAdmissionJson(args, async () => ({
      ...result,
      code: 1,
      stdout: '',
      stderr: "no required checks reported on the 'feature' branch\n"
    }))
  ).toEqual([])
  for (const change of [
    { code: 2, stderr: 'authentication failed' },
    { code: 1, stdout: '', stderr: 'network failed' },
    { code: 8, stdout: '[]' },
    { outputTruncated: true },
    { timedOut: true }
  ]) {
    await expect(
      readMergeAdmissionJson(args, async () => ({ ...result, ...change }))
    ).rejects.toThrow()
  }
})
