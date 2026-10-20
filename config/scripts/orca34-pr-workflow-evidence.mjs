import assert from 'node:assert/strict'
import { readReleaseGitHubJson } from './orca34-upstream-discovery.mjs'

// This proves the full workflow only; branch protection and merge admission remain separate.
export async function inspectOrca34PrWorkflow(number, expectedHead, read = readReleaseGitHubJson) {
  assert(Number.isSafeInteger(number) && number > 0, 'Expected a PR number')
  assert.match(expectedHead, /^[a-f0-9]{40}$/)
  const prefix = 'repos/34/orca'
  const pullPath = `${prefix}/pulls/${number}`
  const assertPull = (pull) => {
    assert.equal(pull.number, number)
    assert.equal(pull.state, 'open', 'PR must remain open')
    assert.equal(pull.draft, false, 'Draft PRs do not prove full CI')
    assert.equal(pull.head?.sha, expectedHead, 'PR head changed')
    assert.equal(pull.head?.repo?.full_name, '34/orca')
    assert.equal(pull.base?.repo?.full_name, '34/orca')
  }
  const pull = await read(pullPath)
  assertPull(pull)
  const response = await read(
    `${prefix}/actions/workflows/pr.yml/runs?event=pull_request&head_sha=${expectedHead}&per_page=100`
  )
  assert(Array.isArray(response.workflow_runs), 'Missing workflow runs')
  const runs = response.workflow_runs
    .filter(
      (run) =>
        run.path === '.github/workflows/pr.yml' &&
        run.event === 'pull_request' &&
        run.head_sha === expectedHead &&
        run.pull_requests?.some((pr) => pr.number === number)
    )
    .sort((a, b) => b.id - a.id)
  const run = runs[0]
  let evidence = { state: 'blocked', reason: 'missing-full-workflow', head: expectedHead }
  if (run) {
    assert(Number.isSafeInteger(run.id) && run.id > 0, 'Invalid workflow run')
    assert(Number.isSafeInteger(run.run_attempt) && run.run_attempt > 0, 'Invalid run attempt')
    const identity = { head: expectedHead, runId: run.id, attempt: run.run_attempt }
    const fullTitle = new RegExp(
      `^PR ${number} \\| source ([a-f0-9]{40}) \\| workflow [a-f0-9]{40} \\| unit full$`
    )
    const title = fullTitle.exec(run.display_title ?? '')
    if (!title) {
      evidence = { ...identity, state: 'blocked', reason: 'unverified-full-test-mode' }
    } else if (title[1] !== pull.merge_commit_sha) {
      evidence = { ...identity, state: 'blocked', reason: 'workflow-tested-a-different-merge' }
    } else if (run.status !== 'completed') {
      evidence = { ...identity, state: 'pending', reason: 'workflow-incomplete' }
    } else if (run.conclusion !== 'success') {
      evidence = { ...identity, state: 'blocked', reason: 'workflow-not-successful' }
    } else {
      const jobs = await read(
        `${prefix}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`
      )
      assert(Array.isArray(jobs.jobs), 'Missing workflow jobs')
      assert(jobs.total_count === jobs.jobs.length, 'Incomplete workflow job evidence')
      const aggregate = jobs.jobs.filter((job) => job.name === 'PR checks passed')
      evidence = {
        ...identity,
        state: 'blocked',
        reason: 'missing-or-unsuccessful-aggregate'
      }
      if (
        aggregate.length === 1 &&
        aggregate[0].head_sha === expectedHead &&
        aggregate[0].status === 'completed' &&
        aggregate[0].conclusion === 'success'
      ) {
        evidence = { ...identity, state: 'passed', reason: 'full-workflow-successful' }
      }
    }
    const latest = await read(`${prefix}/actions/runs/${run.id}`)
    assert.equal(latest.head_sha, expectedHead, 'Workflow head changed')
    assert.equal(latest.run_attempt, run.run_attempt, 'Workflow was rerun during inspection')
    assert.equal(latest.status, run.status, 'Workflow changed during inspection; retry')
    assert.equal(latest.conclusion, run.conclusion, 'Workflow result changed; retry')
  }
  const currentPull = await read(pullPath)
  assertPull(currentPull)
  assert.equal(currentPull.base?.sha, pull.base?.sha, 'PR base changed during inspection')
  assert.equal(
    currentPull.merge_commit_sha,
    pull.merge_commit_sha,
    'PR test merge changed during inspection'
  )
  assert.match(currentPull.base?.sha ?? '', /^[a-f0-9]{40}$/, 'Missing PR base identity')
  return { ...evidence, base: currentPull.base.sha }
}
