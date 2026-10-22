import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runProcess } from '@orca/process-host'
import { commitOrca34Sync } from './commit-orca34-sync.mjs'
import { assertOrca34SyncPlan } from './plan-orca34-sync.mjs'
import { createSyncGit } from './orca34-sync-git.mjs'
import { withUpstreamReleaseLease } from './orca34-upstream-record.mjs'
import { writeInstallReceipt } from './orca34-install-snapshot.mjs'

const repository = '34/orca'
const remote = 'git@github.com:34/orca.git'

export function assertOrca34PrDescription(body) {
  assert.equal(typeof body, 'string')
  assert(body.length > 0 && body.length <= 60000, 'A reviewed PR description is required')
  for (const heading of ['ELI5', 'What Changed', 'Why', 'Testing']) {
    assert(body.includes(`## ${heading}\n`), `PR description is missing ${heading}`)
  }
}

// Publication consumes the committed receipt; it cannot build or merge a new candidate.
export async function publishOrca34Sync(options, { run = runProcess } = {}) {
  const { directory, tag, stage, body } = options
  assertOrca34PrDescription(body)
  const commit = await commitOrca34Sync({ ...options, requireCommitted: true }, { run })
  return withUpstreamReleaseLease(directory, async (root, lease) => {
    const folder = join(root, 'sync', tag)
    const plan = JSON.parse(await readFile(join(folder, 'plan.json'), 'utf8'))
    assertOrca34SyncPlan(plan, plan.release)
    const selected = plan.stages[stage === 'main' ? 0 : 1]
    assert.equal(selected.branch, commit.branch)
    assert.equal(selected.baseCommit, commit.base)
    assert.deepEqual(
      JSON.parse(await readFile(join(folder, `${stage}-commit.json`), 'utf8')),
      commit
    )
    const receipt = join(folder, `${stage}-publication.json`)
    const { text, git } = createSyncGit(commit.source, lease, run)
    const verifyLocal = async () => {
      assert.equal(await text(['symbolic-ref', '--short', 'HEAD']), commit.branch)
      assert.equal(await text(['rev-parse', 'HEAD']), commit.commit, 'Candidate head changed')
      assert.equal(await text(['status', '--porcelain']), '', 'Candidate checkout changed')
    }
    const identity = {
      repository,
      branch: commit.branch,
      head: commit.commit,
      base: selected.base,
      baseCommit: commit.base
    }
    let state
    try {
      state = JSON.parse(await readFile(receipt, 'utf8'))
      assert.equal(state.schemaVersion, 1)
      assert.deepEqual(state.identity, identity)
      assert.equal(state.body, body, 'Saved PR description changed')
      assert(
        ['planned', 'pushing', 'pushed', 'creating', 'published', 'unverifiable'].includes(
          state.phase
        )
      )
      assert(
        !['pushing', 'creating', 'unverifiable'].includes(state.phase),
        'Previous publication exit is unverifiable'
      )
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error
      }
    }
    state ??= { schemaVersion: 1, identity, body, phase: 'planned' }
    const save = async (phase) => {
      lease.assertActive()
      state.phase = phase
      await writeInstallReceipt(receipt, state)
    }
    const api = async (endpoint, input) => {
      lease.assertActive()
      let terminated = false
      const result = await run({
        program: 'gh',
        args: ['api', endpoint, ...(input ? ['--method', 'POST', '--input', '-'] : [])],
        input: input ? JSON.stringify(input) : undefined,
        timeoutMs: 30000,
        maxOutputBytes: 2 * 1024 * 1024,
        terminationBarrier: true,
        onChildTerminated: () => {
          terminated = true
        }
      })
      assert(terminated, 'GitHub child exit is unverifiable')
      assert(
        result.code === 0 && !result.timedOut && !result.outputTruncated,
        'GitHub publication request did not finish completely'
      )
      return JSON.parse(result.stdout)
    }
    const ref = async (branch) => {
      const name = `refs/heads/${branch}`
      const value = await text(['ls-remote', '--refs', remote, name])
      if (!value) {
        return null
      }
      const parts = value.split(/\s+/)
      assert.equal(parts.length, 2)
      assert.equal(parts[1], name)
      assert.match(parts[0], /^[a-f0-9]{40}$/)
      return parts[0]
    }
    await verifyLocal()
    assert.equal(await ref(selected.base), commit.base, 'Remote base changed; prepare a new plan')
    const remoteHead = await ref(commit.branch)
    assert(
      remoteHead === null || remoteHead === commit.commit,
      'Remote candidate branch has another owner or commit'
    )
    if (state.phase === 'published') {
      assert.equal(remoteHead, commit.commit, 'Published branch disappeared')
    }
    if (remoteHead === null) {
      await save('pushing')
      try {
        await git(['push', remote, `${commit.commit}:refs/heads/${commit.branch}`])
        assert.equal(await ref(commit.branch), commit.commit, 'Pushed head did not match')
      } catch (error) {
        await save('unverifiable')
        throw error
      }
    }
    if (state.phase !== 'published') {
      await save('pushed')
    }
    await verifyLocal()
    assert.equal(await ref(selected.base), commit.base, 'Remote base changed during publication')
    const candidates = await api(
      `repos/${repository}/pulls?state=all&head=34:${encodeURIComponent(commit.branch)}&base=${encodeURIComponent(selected.base)}&per_page=100`
    )
    assert(Array.isArray(candidates) && candidates.length < 100, 'Ambiguous PR lookup')
    assert(candidates.length <= 1, 'Multiple PRs exist for this candidate')
    let pr = candidates[0]
    if (!pr) {
      assert.notEqual(state.phase, 'published', 'Published PR disappeared')
      await save('creating')
      try {
        pr = await api(`repos/${repository}/pulls`, {
          title: `Sync Orca ${tag} into ${selected.base}`,
          head: commit.branch,
          base: selected.base,
          body
        })
      } catch (error) {
        await save('unverifiable')
        throw error
      }
    }
    assert.equal(pr.state, 'open', 'Candidate PR is no longer open')
    assert.equal(pr.head?.repo?.full_name, repository)
    assert.equal(pr.base?.repo?.full_name, repository)
    assert.equal(pr.head.ref, commit.branch)
    assert.equal(pr.head.sha, commit.commit, 'PR head changed')
    assert.equal(pr.base.ref, selected.base)
    assert.equal(pr.base.sha, commit.base, 'PR base changed')
    assert(Number.isSafeInteger(pr.number) && pr.number > 0)
    assert.equal(pr.html_url, `https://github.com/${repository}/pull/${pr.number}`)
    if (state.number) {
      assert.equal(pr.number, state.number)
    }
    await verifyLocal()
    assert.equal(
      await ref(commit.branch),
      commit.commit,
      'Remote candidate changed during PR creation'
    )
    assert.equal(await ref(selected.base), commit.base, 'Remote base changed during PR creation')
    state.number = pr.number
    state.url = pr.html_url
    await save('published')
    return state
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [directory, tag, stage, bodyFile, ...extra] = process.argv.slice(2)
  if (!bodyFile || extra.length) {
    console.error(
      'Usage: publish-orca34-sync <state-directory> <tag> <main|local> <pr-description-file>'
    )
    process.exitCode = 1
  } else {
    readFile(bodyFile, 'utf8')
      .then((body) => publishOrca34Sync({ directory, tag, stage, body }))
      .then(
        (state) => process.stdout.write(`${JSON.stringify(state, null, 2)}\n`),
        (error) => {
          console.error(error.message)
          process.exitCode = 1
        }
      )
  }
}
