import { expect, it } from 'vitest'
import { inspectOrca34PrWorkflow } from './orca34-pr-workflow-evidence.mjs'

const head = 'a'.repeat(40)
const pull = {
  number: 2,
  state: 'open',
  draft: false,
  head: { sha: head, repo: { full_name: '34/orca' } },
  base: { sha: 'b'.repeat(40), repo: { full_name: '34/orca' } }
}
const run = {
  id: 42,
  display_title: `PR 2 | source ${head} | workflow ${head} | unit full`,
  run_attempt: 1,
  path: '.github/workflows/pr.yml',
  event: 'pull_request',
  head_sha: head,
  pull_requests: [{ number: 2 }],
  status: 'completed',
  conclusion: 'success'
}
const aggregate = {
  name: 'PR checks passed',
  head_sha: head,
  status: 'completed',
  conclusion: 'success'
}
function reader(responses) {
  return async () => {
    if (!responses.length) {
      throw new Error('Unexpected request')
    }
    return responses.shift()
  }
}
function inspect(responses) {
  return inspectOrca34PrWorkflow(2, head, reader(responses))
}

it('requires successful aggregate from the exact run attempt and rechecks the PR', async () => {
  expect(
    await inspect([
      pull,
      { workflow_runs: [run] },
      { total_count: 1, jobs: [aggregate] },
      run,
      pull
    ])
  ).toMatchObject({ state: 'passed', runId: 42, attempt: 1, head })
})

it.each([
  { path: '.github/workflows/mobile.yml' },
  { head_sha: 'c'.repeat(40) },
  { event: 'push' },
  { pull_requests: [{ number: 3 }] }
])('rejects unrelated success: %j', async (change) => {
  expect(await inspect([pull, { workflow_runs: [{ ...run, ...change }] }, pull])).toMatchObject({
    state: 'blocked',
    reason: 'missing-full-workflow'
  })
})

it('does not reuse older success while a newer run is pending', async () => {
  const newer = { ...run, id: 43, status: 'queued', conclusion: null }
  expect(await inspect([pull, { workflow_runs: [run, newer] }, newer, pull])).toMatchObject({
    state: 'pending',
    runId: 43
  })
})

it('refuses a selected-test run even when its aggregate succeeded', async () => {
  const selected = {
    ...run,
    display_title: run.display_title.replace('unit full', 'unit selected')
  }
  expect(await inspect([pull, { workflow_runs: [selected] }, selected, pull])).toMatchObject({
    state: 'blocked',
    reason: 'unverified-full-test-mode'
  })
})

it.each(['failure', 'cancelled', 'skipped', null])(
  'blocks aggregate conclusion %s',
  async (conclusion) => {
    expect(
      await inspect([
        pull,
        { workflow_runs: [run] },
        { total_count: 1, jobs: [{ ...aggregate, conclusion }] },
        run,
        pull
      ])
    ).toMatchObject({ state: 'blocked' })
  }
)

it('refuses partial job pages and concurrent reruns', async () => {
  await expect(
    inspect([pull, { workflow_runs: [run] }, { total_count: 101, jobs: [aggregate] }])
  ).rejects.toThrow('Incomplete')
  await expect(
    inspect([
      pull,
      { workflow_runs: [run] },
      { total_count: 1, jobs: [aggregate] },
      { ...run, run_attempt: 2 }
    ])
  ).rejects.toThrow('rerun')
})

it('refuses a PR head change after reading successful evidence', async () => {
  await expect(
    inspect([
      pull,
      { workflow_runs: [run] },
      { total_count: 1, jobs: [aggregate] },
      run,
      { ...pull, head: { ...pull.head, sha: 'c'.repeat(40) } }
    ])
  ).rejects.toThrow('head changed')
})
