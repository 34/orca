import assert from 'node:assert/strict'
import { readFile, realpath } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { mergeOrca34Sync, inspectOrca34MergedSync } from './merge-orca34-sync.mjs'
import { runLocalDelivery, readLocalDelivery } from './deliver-orca34-local.mjs'
import { verifyOrca34InstallCandidate } from './verify-orca34-install-candidate.mjs'
import { withUpstreamReleaseLease } from './orca34-upstream-record.mjs'
import { assertSeparateInstallPaths, writeInstallReceipt } from './orca34-install-snapshot.mjs'

// This explicit entry point is never called by candidate discovery or its scheduler.
export async function applyOrca34Release(
  { directory, target, profile },
  {
    merge = mergeOrca34Sync,
    inspectMerged = inspectOrca34MergedSync,
    deliver = runLocalDelivery,
    readDelivery = readLocalDelivery,
    verify = verifyOrca34InstallCandidate
  } = {}
) {
  directory = await realpath(resolve(directory))
  target = await realpath(resolve(target))
  profile = await realpath(resolve(profile))
  assertSeparateInstallPaths([directory, target, profile])
  return withUpstreamReleaseLease(join(directory, 'automation'), async (_root, lease) => {
    const release = JSON.parse(await readFile(join(directory, 'release-run.json'), 'utf8'))
    assert.equal(release.schemaVersion, 1)
    assert.equal(release.directory, directory)
    assert.equal(release.phase, 'candidate-ready')
    assert.match(release.tag, /^v\d+\.\d+\.\d+$/)
    for (const stage of ['main', 'local']) {
      assert.match(release[stage].head, /^[a-f0-9]{40}$/)
      assert(Number.isSafeInteger(release[stage].number) && release[stage].number > 0)
    }
    const identity = {
      tag: release.tag,
      main: { head: release.main.head, number: release.main.number },
      local: { head: release.local.head, number: release.local.number },
      candidate: await realpath(release.candidate),
      target,
      profile
    }
    assertSeparateInstallPaths([target, profile, identity.candidate])
    verify(identity.candidate, identity.local.head)
    const path = join(directory, 'sync', release.tag, 'application.json')
    let state
    try {
      state = JSON.parse(await readFile(path, 'utf8'))
      assert.equal(state.schemaVersion, 1)
      assert.deepEqual(state.identity, identity, 'Release application identity changed')
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error
      }
    }
    state ??= { schemaVersion: 1, identity, phase: 'checking' }
    const save = async (phase) => {
      lease.assertActive()
      state.phase = phase
      await writeInstallReceipt(path, state)
      return state
    }
    const inspect = async (stage, apply) => {
      const result = await merge({
        directory,
        tag: identity.tag,
        stage,
        apply,
        expectedHead: identity[stage].head,
        expectedNumber: identity[stage].number
      })
      assert.equal(result.identity.head, identity[stage].head)
      assert.equal(result.identity.number, identity[stage].number)
      if (result.phase === 'merged') {
        const evidence = await inspectMerged({ directory, tag: identity.tag, stage })
        assert.equal(evidence.state, 'passed')
        assert.equal(evidence.head, identity[stage].head)
        assert.equal(evidence.number, identity[stage].number)
      }
      return result
    }
    try {
      // Check both sides before the first branch change; each merge rechecks its own gate.
      for (const stage of ['main', 'local']) {
        const result = await inspect(stage, false)
        if (!['ready', 'merged'].includes(result.phase)) {
          return save(`waiting-${stage}`)
        }
      }
      for (const stage of ['main', 'local']) {
        await save(`merging-${stage}`)
        state[stage] = await inspect(stage, true)
        if (state[stage].phase !== 'merged') {
          return save(`waiting-${stage}`)
        }
      }
      await save('installing')
      const deliveryDirectory = join(directory, `delivery-${identity.tag}`)
      let existing
      try {
        existing = await readDelivery(deliveryDirectory)
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error
        }
      }
      if (existing) {
        assert.equal(existing.candidateMode, true)
        for (const key of ['candidate', 'target', 'profile']) {
          assert.equal(existing[key], identity[key], `Delivery ${key} changed`)
        }
        assert.equal(existing.commit, identity.local.head)
      }
      state.delivery = await deliver(
        existing
          ? ['resume', deliveryDirectory]
          : [
              'candidate',
              deliveryDirectory,
              identity.candidate,
              identity.local.head,
              target,
              profile
            ]
      )
      assert.equal(state.delivery.phase, 'healthy')
      assert.equal(state.delivery.commit, identity.local.head)
      delete state.error
      return save('healthy')
    } catch (error) {
      state.error = { phase: state.phase, message: error.message }
      await save('failed')
      throw error
    }
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [directory, target, profile, ...extra] = process.argv.slice(2)
  if (!directory || !target || !profile || extra.length) {
    console.error('Usage: apply-orca34-release <state-directory> <installed.app> <user-data>')
    process.exitCode = 1
  } else {
    applyOrca34Release({ directory, target, profile }).then(
      (state) => process.stdout.write(`${JSON.stringify(state, null, 2)}\n`),
      (error) => {
        console.error(error.message)
        process.exitCode = 1
      }
    )
  }
}
