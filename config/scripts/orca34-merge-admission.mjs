import assert from 'node:assert/strict'
import { runProcess } from '@orca/process-host'
import { inspectOrca34PrWorkflow } from './orca34-pr-workflow-evidence.mjs'

export async function readMergeAdmissionJson(args, run = runProcess) {
  const result = await run({
    program: 'gh',
    args: ['pr', ...args, '--repo', '34/orca'],
    timeoutMs: 30_000,
    maxOutputBytes: 2 * 1024 * 1024
  })
  assert(!result.timedOut && !result.outputTruncated, 'Incomplete merge admission response')
  if (
    args[0] === 'checks' &&
    result.code === 1 &&
    !result.stdout.trim() &&
    /^no required checks reported on the '[^'\r\n]+' branch\s*$/.test(result.stderr)
  ) {
    return []
  }
  assert(
    result.code === 0 || (args[0] === 'checks' && [1, 8].includes(result.code)),
    `Merge admission lookup failed: ${result.stderr.slice(0, 500)}`
  )
  const parsed = JSON.parse(result.stdout)
  if (result.code === 8) {
    assert(Array.isArray(parsed) && parsed.some((check) => check.bucket === 'pending'))
  } else if (result.code === 1) {
    assert(Array.isArray(parsed) && parsed.some((check) => check.bucket !== 'pass'))
  }
  return parsed
}

// Read-only evidence; callers still need release policy authorization before merging.
export async function inspectOrca34MergeAdmission(
  number,
  head,
  { inspectWorkflow = inspectOrca34PrWorkflow, read = readMergeAdmissionJson } = {}
) {
  assert(Number.isSafeInteger(number) && number > 0)
  assert.match(head, /^[a-f0-9]{40}$/)
  const workflow = await inspectWorkflow(number, head)
  if (workflow.state !== 'passed') {
    return { ...workflow, requiredChecks: null }
  }
  const query = [
    'view',
    String(number),
    '--json',
    'headRefOid,baseRefOid,mergeStateStatus,mergeable,reviewDecision'
  ]
  const before = await read(query)
  assert.equal(before.headRefOid, head, 'PR head changed')
  assert.equal(before.baseRefOid, workflow.base, 'PR base changed')
  const checks = await read([
    'checks',
    String(number),
    '--required',
    '--json',
    'name,state,bucket,workflow,link'
  ])
  assert(Array.isArray(checks), 'Missing required checks')
  for (const check of checks) {
    assert.equal(typeof check.name, 'string')
    assert.equal(typeof check.state, 'string')
    assert(['pass', 'fail', 'pending', 'skipping', 'cancel'].includes(check.bucket))
  }
  assert.equal(
    new Set(checks.map((check) => check.name)).size,
    checks.length,
    'Ambiguous check names'
  )
  checks.sort((left, right) => left.name.localeCompare(right.name))
  const after = await read(query)
  assert.deepEqual(after, before, 'PR merge admission changed during inspection; retry')
  const refreshed = await inspectWorkflow(number, head)
  assert.deepEqual(refreshed, workflow, 'Full workflow evidence changed; retry')
  const evidence = { ...workflow, requiredChecks: checks }
  if (checks.some((check) => check.bucket === 'pending')) {
    return { ...evidence, state: 'pending', reason: 'required-checks-pending' }
  }
  if (checks.some((check) => check.bucket !== 'pass' || check.state !== 'SUCCESS')) {
    return { ...evidence, state: 'blocked', reason: 'required-checks-not-successful' }
  }
  if (
    after.mergeStateStatus !== 'CLEAN' ||
    after.mergeable !== 'MERGEABLE' ||
    !['', 'APPROVED'].includes(after.reviewDecision)
  ) {
    return { ...evidence, state: 'blocked', reason: 'repository-merge-policy-not-ready' }
  }
  return { ...evidence, reason: 'full-workflow-and-merge-policy-successful' }
}
