import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile, realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runProcess } from '@orca/process-host'
import { assertOrca34SyncPlan } from './plan-orca34-sync.mjs'
import { createSyncGit } from './orca34-sync-git.mjs'
import { withUpstreamReleaseLease } from './orca34-upstream-record.mjs'
import { writeInstallReceipt } from './orca34-install-snapshot.mjs'

export async function commitOrca34Sync(
  { directory, tag, stage, source = process.cwd(), requireCommitted = false },
  { run = runProcess } = {}
) {
  assert.match(tag, /^v\d+\.\d+\.\d+$/)
  assert(['main', 'local'].includes(stage))
  source = await realpath(source)
  return withUpstreamReleaseLease(directory, async (root, lease) => {
    const outside = relative(source, root)
    assert(
      outside === '..' || outside.startsWith(`..${sep}`) || isAbsolute(outside),
      'Sync state must be outside the source checkout'
    )
    const folder = join(root, 'sync', tag)
    assert.equal(await realpath(folder), folder)
    const plan = JSON.parse(await readFile(join(folder, 'plan.json'), 'utf8'))
    assertOrca34SyncPlan(plan, plan.release)
    assert.equal(plan.release.tag, tag)
    const selected = plan.stages[stage === 'main' ? 0 : 1]
    const prepared = JSON.parse(await readFile(join(folder, `${stage}.json`), 'utf8'))
    assert.equal(prepared.schemaVersion, 1)
    assert.equal(prepared.source, source)
    assert.equal(prepared.branch, selected.branch)
    assert.equal(prepared.base, selected.baseCommit)
    assert.equal(prepared.phase, 'prepared', 'Finish merge preparation before committing')
    assert.match(prepared.target, /^[a-f0-9]{40}$/)
    if (stage === 'main') {
      assert.equal(prepared.target, plan.release.commit)
    }
    const receipt = join(folder, `${stage}-commit.json`)
    const { git, text } = createSyncGit(source, lease, run)
    let state
    try {
      state = JSON.parse(await readFile(receipt, 'utf8'))
      assert.equal(state.schemaVersion, 1)
      for (const key of ['source', 'branch', 'base', 'target']) {
        assert.equal(state[key], prepared[key])
      }
      assert.match(state.tree, /^[a-f0-9]{40}$/)
      assert.match(state.operationId, /^[a-f0-9-]{36}$/)
      assert(
        ['checking', 'committing', 'committed', 'failed', 'unverifiable'].includes(state.phase)
      )
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error
      }
    }
    assert(!requireCommitted || state?.phase === 'committed', 'Candidate must already be committed')
    assert.equal(await text(['symbolic-ref', '--short', 'HEAD']), prepared.branch)
    const verifyCommit = async () => {
      assert.equal(await text(['symbolic-ref', '--short', 'HEAD']), prepared.branch)
      assert.match(state.commit, /^[a-f0-9]{40}$/)
      assert.equal(await text(['rev-parse', 'HEAD']), state.commit, 'Committed head changed')
      assert.equal(await text(['show', '-s', '--format=%T', 'HEAD']), state.tree)
      assert.equal(
        await text(['show', '-s', '--format=%P', 'HEAD']),
        `${state.base} ${state.target}`
      )
      assert((await text(['show', '-s', '--format=%B', 'HEAD'])).includes(state.operationId))
      assert.equal(await text(['status', '--porcelain']), '', 'Committed checkout changed')
    }
    if (state?.phase === 'committed') {
      await verifyCommit()
      return state
    }
    assert(!state || state.phase === 'failed', 'Previous validation or commit exit is unverifiable')
    const attempts = state?.attempts ?? 0
    assert(
      Number.isSafeInteger(attempts) && attempts >= 0 && attempts < 3,
      'Three validation attempts already used'
    )
    state = undefined
    const verifyMerge = async () => {
      assert.equal(await text(['symbolic-ref', '--short', 'HEAD']), prepared.branch)
      assert.equal(await text(['rev-parse', 'HEAD']), prepared.base)
      assert.equal(await text(['rev-parse', '--verify', 'MERGE_HEAD']), prepared.target)
      assert.equal(
        await text(['diff', '--name-only', '--diff-filter=U']),
        '',
        'Unresolved conflicts remain'
      )
      await git(['diff', '--exit-code'])
      assert.equal(
        await text(['ls-files', '--others', '--exclude-standard']),
        '',
        'Untracked files need review'
      )
      await git(['merge-base', '--is-ancestor', plan.release.commit, prepared.target])
      if (state) {
        assert.equal(await text(['write-tree']), state.tree, 'Staged content changed')
      }
    }
    await verifyMerge()
    state = {
      schemaVersion: 1,
      source,
      branch: prepared.branch,
      base: prepared.base,
      target: prepared.target,
      tree: await text(['write-tree']),
      operationId: randomUUID(),
      attempts: attempts + 1,
      phase: 'checking'
    }
    const save = async () => {
      lease.assertActive()
      await writeInstallReceipt(receipt, state)
    }
    await save()
    let terminated = true
    try {
      let index = 0
      for (const { program, args } of [
        { program: 'git', args: ['diff', '--cached', '--check'] },
        { program: 'pnpm', args: ['tc'] },
        { program: 'pnpm', args: ['run', 'check:code-quality:changed', prepared.base] }
      ]) {
        lease.assertActive()
        terminated = false
        const result = await run({
          program,
          args,
          cwd: source,
          env: { ...process.env, ORCA_BACKGROUND_LAUNCH: '1', ORCA_SKIP_DEV_CLI_INSTALL: '1' },
          timeoutMs: 20 * 60_000,
          maxOutputBytes: 2 * 1024 * 1024,
          terminationBarrier: true,
          onChildTerminated: () => {
            terminated = true
          }
        })
        assert(terminated, 'Validation child exit is unverifiable')
        await writeInstallReceipt(
          join(folder, `${stage}-${state.operationId}-check-${++index}.json`),
          { program, args, ...result }
        )
        assert(
          result.code === 0 && !result.timedOut && !result.outputTruncated,
          `Sync validation failed: ${program}`
        )
        await verifyMerge()
      }
      state.phase = 'committing'
      await save()
      terminated = false
      await git([
        'commit',
        '-m',
        `Integrate ${tag} into ${selected.base}\n\nOrca-Sync-Operation: ${state.operationId}`
      ])
      terminated = true
      state.commit = await text(['rev-parse', 'HEAD'])
      await verifyCommit()
      state.phase = 'committed'
      await save()
      return state
    } catch (error) {
      state.phase = terminated ? 'failed' : 'unverifiable'
      state.error = error instanceof Error ? error.message : String(error)
      await save()
      throw error
    }
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [directory, tag, stage, ...extra] = process.argv.slice(2)
  if (!directory || !tag || !stage || extra.length) {
    console.error('Usage: commit-orca34-sync <state-directory> <tag> <main|local>')
    process.exitCode = 1
  } else {
    commitOrca34Sync({ directory, tag, stage }).then(
      (state) => process.stdout.write(`${JSON.stringify(state, null, 2)}\n`),
      (error) => {
        console.error(error instanceof Error ? error.message : String(error))
        process.exitCode = 1
      }
    )
  }
}
