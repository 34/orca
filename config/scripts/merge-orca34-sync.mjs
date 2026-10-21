import assert from 'node:assert/strict'
import { readFile, realpath } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runProcess } from '@orca/process-host'
import { assertOrca34SyncPlan } from './plan-orca34-sync.mjs'
import { inspectOrca34PrWorkflow } from './orca34-pr-workflow-evidence.mjs'
import { inspectOrca34MergeAdmission } from './orca34-merge-admission.mjs'
import { readReleaseGitHubJson } from './orca34-upstream-discovery.mjs'
import { withUpstreamReleaseLease } from './orca34-upstream-record.mjs'
import { writeInstallReceipt } from './orca34-install-snapshot.mjs'

export async function mergeOrca34Sync(
  { directory, tag, stage, apply = false },
  { inspect = inspectOrca34MergeAdmission, read = readReleaseGitHubJson, run = runProcess } = {}
) {
  assert.match(tag, /^v\d+\.\d+\.\d+$/)
  assert(['main', 'local'].includes(stage))
  assert.equal(typeof apply, 'boolean')
  return withUpstreamReleaseLease(directory, async (root, lease) => {
    const folder = join(root, 'sync', tag)
    assert.equal(await realpath(folder), folder)
    const plan = JSON.parse(await readFile(join(folder, 'plan.json'), 'utf8'))
    assertOrca34SyncPlan(plan, plan.release)
    assert.equal(plan.release.tag, tag)
    const selected = plan.stages[stage === 'main' ? 0 : 1]
    const publication = JSON.parse(
      await readFile(join(folder, `${stage}-publication.json`), 'utf8')
    )
    assert.equal(publication.schemaVersion, 1)
    assert.equal(publication.phase, 'published')
    const { identity, number } = publication
    assert.deepEqual(identity, {
      repository: '34/orca',
      branch: selected.branch,
      head: identity.head,
      base: selected.base,
      baseCommit: selected.baseCommit
    })
    assert.match(identity.head, /^[a-f0-9]{40}$/)
    assert(Number.isSafeInteger(number) && number > 0)
    const path = join(folder, `${stage}-merge.json`)
    let state
    try {
      state = JSON.parse(await readFile(path, 'utf8'))
      assert.equal(state.schemaVersion, 1)
      assert.deepEqual(state.identity, { ...identity, number })
      assert(['waiting', 'ready', 'merging', 'unverifiable', 'merged'].includes(state.phase))
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error
      }
    }
    state ??= { schemaVersion: 1, identity: { ...identity, number }, phase: 'waiting' }
    const save = async (phase) => {
      lease.assertActive()
      state.phase = phase
      await writeInstallReceipt(path, state)
      return state
    }
    const inspectPull = async () => {
      const pr = await read(`repos/34/orca/pulls/${number}`)
      assert.equal(pr.number, number)
      assert.equal(pr.head?.repo?.full_name, '34/orca')
      assert.equal(pr.base?.repo?.full_name, '34/orca')
      assert.equal(pr.head.ref, identity.branch)
      assert.equal(pr.head.sha, identity.head, 'PR head changed')
      assert.equal(pr.base.ref, identity.base)
      return pr
    }
    const confirmMerged = async (pr) => {
      assert.equal(pr.merged, true, 'Merge outcome is not confirmed')
      assert.equal(pr.state, 'closed')
      assert.match(pr.merge_commit_sha, /^[a-f0-9]{40}$/)
      const commit = await read(`repos/34/orca/git/commits/${pr.merge_commit_sha}`)
      assert.equal(commit.sha, pr.merge_commit_sha)
      assert.deepEqual(
        commit.parents.map((parent) => parent.sha),
        [identity.baseCommit, identity.head],
        'Merged commit has different parents; reconcile the branch before continuing'
      )
      if (state.commit) {
        assert.equal(state.commit, commit.sha)
      }
      state.commit = commit.sha
      delete state.error
      return save('merged')
    }
    const pr = await inspectPull()
    // A lost response can be reconciled read-only; an uncertain open PR is never submitted again.
    if (pr.merged) {
      return confirmMerged(pr)
    }
    assert(
      !['merging', 'unverifiable', 'merged'].includes(state.phase),
      'Previous merge outcome is unverifiable; no new merge will be submitted'
    )
    assert.equal(pr.state, 'open')
    assert.equal(pr.base.sha, identity.baseCommit, 'PR base changed')
    const evidence = await inspect(number, identity.head)
    assert.equal(evidence.head, identity.head)
    assert.equal(evidence.base, identity.baseCommit)
    assert(['passed', 'pending', 'blocked'].includes(evidence.state))
    state.evidence = evidence
    if (evidence.state !== 'passed') {
      return save('waiting')
    }
    await save('ready')
    if (!apply) {
      return state
    }
    const before = await inspectPull()
    assert.equal(before.state, 'open')
    assert.equal(before.merged, false)
    assert.equal(before.base.sha, identity.baseCommit, 'PR base changed before merge')
    await save('merging')
    try {
      let terminated = false
      const result = await run({
        program: 'gh',
        args: [
          'pr',
          'merge',
          String(number),
          '--repo',
          '34/orca',
          '--merge',
          '--match-head-commit',
          identity.head
        ],
        timeoutMs: 30000,
        maxOutputBytes: 1024 * 1024,
        terminationBarrier: true,
        onChildTerminated: () => {
          terminated = true
        }
      })
      assert(terminated, 'Merge child exit is unverifiable')
      assert(
        result.code === 0 && !result.timedOut && !result.outputTruncated,
        'Merge request did not finish completely'
      )
      return await confirmMerged(await inspectPull())
    } catch (error) {
      state.error = error.message
      await save('unverifiable')
      throw error
    }
  })
}

// Recheck historical CI without treating a closed PR as eligible for another merge.
export async function inspectOrca34MergedSync(
  options,
  { read = readReleaseGitHubJson, inspectWorkflow = inspectOrca34PrWorkflow } = {}
) {
  const state = await mergeOrca34Sync({ ...options, apply: false }, { read })
  assert.equal(state.phase, 'merged', 'Sync stage has not been merged')
  assert.equal(state.evidence?.state, 'passed', 'Missing pre-merge admission receipt')
  assert.equal(state.evidence.head, state.identity.head)
  assert.equal(state.evidence.base, state.identity.baseCommit)
  assert(Array.isArray(state.evidence.requiredChecks), 'Missing pre-merge required checks')
  assert(
    state.evidence.requiredChecks.every(
      (check) => check.bucket === 'pass' && check.state === 'SUCCESS'
    )
  )
  const evidence = await inspectWorkflow(state.identity.number, state.identity.head, read, {
    merged: { base: state.identity.baseCommit, commit: state.commit }
  })
  assert.equal(evidence.head, state.identity.head)
  assert.equal(evidence.base, state.identity.baseCommit)
  return {
    ...evidence,
    number: state.identity.number,
    mergeCommit: state.commit,
    requiredChecks: state.evidence.requiredChecks
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [directory, tag, stage, mode, ...extra] = process.argv.slice(2)
  if (!stage || extra.length || (mode && mode !== '--apply')) {
    console.error('Usage: merge-orca34-sync <state-directory> <tag> <main|local> [--apply]')
    process.exitCode = 1
  } else {
    mergeOrca34Sync({ directory, tag, stage, apply: mode === '--apply' }).then(
      (state) => process.stdout.write(`${JSON.stringify(state, null, 2)}\n`),
      (error) => {
        console.error(error.message)
        process.exitCode = 1
      }
    )
  }
}
