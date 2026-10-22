import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, realpath } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runProcess } from '@orca/process-host'
import { assertOrca34SyncPlan } from './plan-orca34-sync.mjs'
import { createSyncGit } from './orca34-sync-git.mjs'
import { withUpstreamReleaseLease } from './orca34-upstream-record.mjs'
import { writeInstallReceipt } from './orca34-install-snapshot.mjs'

// Only freshly allocated, receipt-owned directories may be initialized by this entry.
export async function checkoutOrca34Sync({ directory, tag, stage }, { run = runProcess } = {}) {
  assert.match(tag, /^v\d+\.\d+\.\d+$/)
  assert(['main', 'local'].includes(stage))
  return withUpstreamReleaseLease(directory, async (root, lease) => {
    const folder = join(root, 'sync', tag)
    assert.equal(await realpath(folder), folder)
    const plan = JSON.parse(await readFile(join(folder, 'plan.json'), 'utf8'))
    assertOrca34SyncPlan(plan, plan.release)
    assert.equal(plan.release.tag, tag)
    const selected = plan.stages[stage === 'main' ? 0 : 1]
    const identity = {
      tag,
      stage,
      base: selected.base,
      baseCommit: selected.baseCommit,
      upstream: plan.release.commit
    }
    const path = join(folder, `${stage}-checkout.json`)
    const parent = join(root, 'sources', tag)
    await mkdir(parent, { recursive: true, mode: 0o700 })
    assert.equal(await realpath(parent), parent)
    let state
    try {
      state = JSON.parse(await readFile(path, 'utf8'))
      assert.equal(state.schemaVersion, 1)
      assert.deepEqual(state.identity, identity)
      assert.equal(await realpath(state.source), state.source)
      assert.equal(resolve(state.source, '..'), parent, 'Checkout escaped its owned directory')
      assert.equal(
        state.phase,
        'prepared',
        'Interrupted checkout is unverifiable; retain it for inspection'
      )
      const { text } = createSyncGit(state.source, lease, run)
      assert.equal(await realpath(await text(['rev-parse', '--show-toplevel'])), state.source)
      await text(['cat-file', '-e', `${identity.baseCommit}^{commit}`])
      await text(['cat-file', '-e', `${identity.upstream}^{commit}`])
      return state
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error
      }
      // Missing files inside an existing receipt must not allocate a replacement checkout.
      if (state) {
        throw error
      }
    }
    const source = await mkdtemp(join(parent, `${stage}-`))
    state = { schemaVersion: 1, identity, source, phase: 'preparing' }
    await writeInstallReceipt(path, state)
    const { git, text } = createSyncGit(source, lease, run)
    try {
      await git(['init', '-q'])
      await git([
        'fetch',
        '--no-tags',
        'https://github.com/34/orca.git',
        `refs/heads/${selected.base}`
      ])
      assert.equal(
        await text(['rev-parse', 'FETCH_HEAD^{commit}']),
        identity.baseCommit,
        'Fork baseline moved before checkout'
      )
      await git(['checkout', '-b', `codex/orca34-base-${tag}-${stage}`, identity.baseCommit])
      await git(['fetch', '--no-tags', 'https://github.com/stablyai/orca.git', `refs/tags/${tag}`])
      assert.equal(
        await text(['rev-parse', 'FETCH_HEAD^{commit}']),
        identity.upstream,
        'Official release tag moved before checkout'
      )
      assert.equal(await text(['rev-parse', 'HEAD']), identity.baseCommit)
      assert.equal(await text(['status', '--porcelain']), '')
      state.phase = 'prepared'
      lease.assertActive()
      await writeInstallReceipt(path, state)
      return state
    } catch (error) {
      state.phase = 'unverifiable'
      state.error = error.message
      await writeInstallReceipt(path, state)
      throw error
    }
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [directory, tag, stage, ...extra] = process.argv.slice(2)
  if (!stage || extra.length) {
    console.error('Usage: checkout-orca34-sync <state-directory> <tag> <main|local>')
    process.exitCode = 1
  } else {
    checkoutOrca34Sync({ directory, tag, stage }).then(
      (state) => process.stdout.write(`${JSON.stringify(state, null, 2)}\n`),
      (error) => {
        console.error(error.message)
        process.exitCode = 1
      }
    )
  }
}
