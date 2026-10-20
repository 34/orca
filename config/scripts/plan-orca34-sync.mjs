import assert from 'node:assert/strict'
import { mkdir, readFile, realpath } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  assertOfficialRelease,
  discoverOfficialRelease,
  readReleaseGitHubJson
} from './orca34-upstream-discovery.mjs'
import { observeOfficialRelease, withUpstreamReleaseLease } from './orca34-upstream-record.mjs'
import { writeInstallReceipt } from './orca34-install-snapshot.mjs'

export async function readOrca34Baselines(read = readReleaseGitHubJson) {
  const branches = {}
  for (const name of ['main', '34/local']) {
    const ref = await read(`repos/34/orca/git/ref/heads/${name}`)
    assert.equal(ref.ref, `refs/heads/${name}`, 'Unexpected fork branch')
    assert.equal(ref.object?.type, 'commit', 'Fork branch must point to a commit')
    assert.match(ref.object.sha, /^[a-f0-9]{40}$/)
    branches[name] = ref.object.sha
  }
  return branches
}

function assertPlan(plan, release) {
  assert.equal(plan.schemaVersion, 1)
  assert.equal(plan.repository, '34/orca')
  assertOfficialRelease(plan.release)
  assert.equal(plan.release.tag, release.tag)
  assert.equal(plan.release.commit, release.commit, 'Sync plan release commit changed')
  assert.equal(plan.stages.length, 2)
  for (const [index, base] of ['main', '34/local'].entries()) {
    const stage = plan.stages[index]
    assert.equal(stage.base, base)
    assert.match(stage.baseCommit, /^[a-f0-9]{40}$/)
    assert.equal(stage.branch, `codex/orca34-sync-${release.tag}-${index === 0 ? 'main' : 'local'}`)
    assert.equal(stage.mergeFrom, index === 0 ? release.commit : 'verified-main')
  }
}

// An existing plan keeps its original baselines even if main advanced before local finished.
export async function planOrca34Sync(
  directory,
  { discover = discoverOfficialRelease, baselines = readOrca34Baselines } = {}
) {
  return withUpstreamReleaseLease(directory, async (root, lease) => {
    const release = await discover()
    const observation = await observeOfficialRelease(root, release, lease)
    assert.notEqual(observation.disposition, 'older-release', 'Official latest moved backwards')
    const folder = join(root, 'sync', release.tag)
    const receipt = join(folder, 'plan.json')
    await mkdir(folder, { recursive: true, mode: 0o700 })
    assert.equal(await realpath(folder), folder, 'Sync plan directory must be canonical')
    try {
      const existing = JSON.parse(await readFile(receipt, 'utf8'))
      assertPlan(existing, release)
      return existing
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error
      }
    }
    const before = await baselines()
    for (const name of ['main', '34/local']) {
      assert.match(before[name], /^[a-f0-9]{40}$/)
    }
    const confirmedRelease = await discover()
    assertOfficialRelease(confirmedRelease)
    assert.equal(confirmedRelease.tag, release.tag, 'Official release changed while planning')
    assert.equal(confirmedRelease.commit, release.commit, 'Official release commit changed')
    assert.deepEqual(await baselines(), before, 'Fork baselines changed while planning')
    const plan = {
      schemaVersion: 1,
      repository: '34/orca',
      release,
      createdAt: new Date().toISOString(),
      stages: ['main', '34/local'].map((base, index) => ({
        base,
        baseCommit: before[base],
        branch: `codex/orca34-sync-${release.tag}-${index === 0 ? 'main' : 'local'}`,
        mergeFrom: index === 0 ? release.commit : 'verified-main'
      }))
    }
    assertPlan(plan, release)
    lease.assertActive()
    await writeInstallReceipt(receipt, plan)
    return plan
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2)
  if (args.length !== 1) {
    console.error('Usage: plan-orca34-sync <persistent-state-directory>')
    process.exitCode = 1
  } else {
    planOrca34Sync(args[0]).then(
      (plan) => process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`),
      (error) => {
        console.error(error instanceof Error ? error.message : String(error))
        process.exitCode = 1
      }
    )
  }
}
