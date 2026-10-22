import { expect, it } from 'vitest'
import { inspectOrca34PrWorkflow } from './orca34-pr-workflow-evidence.mjs'

const head = 'a'.repeat(40)
const pull = {
  number: 2,
  state: 'open',
  draft: false,
  merge_commit_sha: head,
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

it('does not reuse a successful run for an older test merge after the base advances', async () => {
  const advanced = { ...pull, merge_commit_sha: 'd'.repeat(40) }
  expect(await inspect([advanced, { workflow_runs: [run] }, run, advanced])).toMatchObject({
    state: 'blocked',
    reason: 'workflow-tested-a-different-merge'
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

function mergedEvidence({ treeChanged = false, parentsChanged = false, merged = true } = {}) {
  const base = pull.base.sha
  const commit = 'c'.repeat(40)
  const closed = {
    ...pull,
    state: 'closed',
    merged,
    merge_commit_sha: commit,
    base: { ...pull.base, sha: commit }
  }
  const tested = {
    sha: head,
    parents: [{ sha: base }, { sha: head }],
    tree: { sha: 'd'.repeat(40) }
  }
  const actual = {
    sha: commit,
    parents: [{ sha: parentsChanged ? 'e'.repeat(40) : base }, { sha: head }],
    tree: { sha: treeChanged ? 'f'.repeat(40) : tested.tree.sha }
  }
  return inspectOrca34PrWorkflow(
    2,
    head,
    reader([
      closed,
      { workflow_runs: [run] },
      tested,
      actual,
      { total_count: 1, jobs: [aggregate] },
      run,
      closed
    ]),
    { merged: { base, commit } }
  )
}
it('proves a merged PR only when the actual merge has the tested tree and pinned parents', async () => {
  expect(await mergedEvidence()).toMatchObject({ state: 'passed', base: pull.base.sha, head })
})
it('rejects a different merge tree or parent even with successful aggregate CI', async () => {
  await expect(mergedEvidence({ treeChanged: true })).rejects.toThrow('tree differs')
  await expect(mergedEvidence({ parentsChanged: true })).rejects.toThrow('pinned parents')
  await expect(mergedEvidence({ merged: false })).rejects.toThrow('not merged')
})
it('continues to refuse closed PRs for ordinary pre-merge admission', async () => {
  await expect(inspect([{ ...pull, state: 'closed', merged: true }])).rejects.toThrow('remain open')
})
