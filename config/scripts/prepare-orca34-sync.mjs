import assert from 'node:assert/strict'
import { readFile, realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runProcess } from '@orca/process-host'
import { assertOrca34SyncPlan } from './plan-orca34-sync.mjs'
import { withUpstreamReleaseLease } from './orca34-upstream-record.mjs'
import { writeInstallReceipt } from './orca34-install-snapshot.mjs'
import { inspectOrca34MergeAdmission } from './orca34-merge-admission.mjs'

export async function prepareOrca34Sync(
  { directory, tag, stage, source = process.cwd(), mainPr, mainCommit },
  { run = runProcess, inspect = inspectOrca34MergeAdmission } = {}
) {
  assert.match(tag, /^v\d+\.\d+\.\d+$/)
  assert(['main', 'local'].includes(stage), 'Expected main or local stage')
  source = await realpath(source)
  return withUpstreamReleaseLease(directory, async (root, lease) => {
    const outside = relative(source, root)
    assert(
      outside === '..' || outside.startsWith(`..${sep}`) || isAbsolute(outside),
      'Sync state must be outside the source checkout'
    )
    const folder = join(root, 'sync', tag)
    assert.equal(await realpath(folder), folder, 'Sync state directory must be canonical')
    const plan = JSON.parse(await readFile(join(folder, 'plan.json'), 'utf8'))
    assertOrca34SyncPlan(plan, plan.release)
    assert.equal(plan.release.tag, tag)
    const selected = plan.stages[stage === 'main' ? 0 : 1]
    const target = stage === 'main' ? plan.release.commit : mainCommit
    assert.match(target, /^[a-f0-9]{40}$/)
    if (stage === 'local') {
      const admission = await inspect(mainPr, target)
      assert.equal(admission.state, 'passed', 'Main candidate has not passed full PR admission')
      assert.equal(admission.base, plan.stages[0].baseCommit, 'Main candidate baseline changed')
      assert.equal(admission.head, target, 'Main candidate changed')
    }
    const receipt = join(folder, `${stage}.json`)
    const identity = { source, base: selected.baseCommit, target, branch: selected.branch }
    let state
    try {
      state = JSON.parse(await readFile(receipt, 'utf8'))
      assert.equal(state.schemaVersion, 1)
      for (const [key, value] of Object.entries(identity)) {
        assert.equal(state[key], value)
      }
      assert(
        [
          'planned',
          'switching',
          'merging',
          'prepared',
          'conflicted',
          'already-integrated'
        ].includes(state.phase)
      )
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error
      }
    }
    const git = async (args, allowed = [0]) => {
      lease.assertActive()
      let terminated = false
      const result = await run({
        program: 'git',
        args,
        cwd: source,
        timeoutMs: 120_000,
        maxOutputBytes: 2 * 1024 * 1024,
        terminationBarrier: true,
        env: {
          ...process.env,
          ORCA_BACKGROUND_LAUNCH: '1',
          ORCA_SKIP_DEV_CLI_INSTALL: '1',
          GIT_TERMINAL_PROMPT: '0'
        },
        onChildTerminated: () => {
          terminated = true
        }
      })
      assert(terminated, 'Git child exit is unverifiable')
      assert(!result.timedOut && !result.outputTruncated, 'Git command did not finish completely')
      assert(allowed.includes(result.code), `Git ${args[0]} failed: ${result.stderr.slice(0, 500)}`)
      return result
    }
    const text = async (args) => (await git(args)).stdout.trim()
    const save = async () => {
      lease.assertActive()
      await writeInstallReceipt(receipt, state)
    }
    const head = await text(['rev-parse', 'HEAD'])
    assert.equal(head, selected.baseCommit, 'Source HEAD differs from the planned baseline')
    const branch = await text(['symbolic-ref', '--short', 'HEAD'])
    const merge = await git(['rev-parse', '-q', '--verify', 'MERGE_HEAD'], [0, 1])
    if (state && ['switching', 'merging'].includes(state.phase)) {
      throw new Error(
        'Interrupted Git operation is unverifiable; inspect its process and checkout before recovery'
      )
    }
    if (state && ['prepared', 'conflicted'].includes(state.phase)) {
      assert.equal(branch, state.branch, 'Sync branch changed')
      assert.equal(merge.stdout.trim(), target, 'Pending merge identity changed')
      const conflicts = await text(['diff', '--name-only', '--diff-filter=U'])
      state.phase = conflicts ? 'conflicted' : 'prepared'
      state.conflicts = conflicts ? conflicts.split('\n') : []
      await save()
      return state
    }
    assert.equal(merge.code, 1, 'Another merge is already in progress')
    assert.equal(await text(['status', '--porcelain']), '', 'Source checkout must be clean')
    if (state?.phase === 'already-integrated') {
      assert.equal(branch, state.branch, 'Sync branch changed')
      await git(['merge-base', '--is-ancestor', target, head])
      return state
    }
    if (!state) {
      const exists = await git(
        ['show-ref', '--verify', '--quiet', `refs/heads/${selected.branch}`],
        [0, 1]
      )
      assert.equal(exists.code, 1, 'Sync branch already exists without an ownership receipt')
      state = { schemaVersion: 1, ...identity, phase: 'planned' }
      await save()
    }
    await git(['cat-file', '-e', `${target}^{commit}`])
    if (stage === 'local') {
      await git(['merge-base', '--is-ancestor', plan.release.commit, target])
    }
    state.phase = 'switching'
    await save()
    await git(['checkout', '-b', selected.branch, selected.baseCommit])
    state.phase = 'merging'
    await save()
    const result = await git(['merge', '--no-commit', '--no-ff', target], [0, 1])
    assert.equal(await text(['rev-parse', 'HEAD']), head, 'Merge unexpectedly committed')
    assert.equal(await text(['symbolic-ref', '--short', 'HEAD']), state.branch)
    const pending = await git(['rev-parse', '-q', '--verify', 'MERGE_HEAD'], [0, 1])
    const conflicts = await text(['diff', '--name-only', '--diff-filter=U'])
    if (pending.code === 1) {
      assert.equal(result.code, 0)
      await git(['merge-base', '--is-ancestor', target, head])
      assert.equal(await text(['status', '--porcelain']), '')
      state.phase = 'already-integrated'
    } else {
      assert.equal(pending.stdout.trim(), target, 'Merge target changed')
      assert(result.code === 0 || conflicts, 'Git merge failed without resolvable conflicts')
      state.phase = conflicts ? 'conflicted' : 'prepared'
    }
    state.conflicts = conflicts ? conflicts.split('\n') : []
    await save()
    return state
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [directory, tag, stage, pr, mainCommit, ...extra] = process.argv.slice(2)
  if (!directory || !tag || !stage || extra.length || (stage === 'main' && pr)) {
    console.error(
      'Usage: prepare-orca34-sync <state-directory> <tag> <main|local> [main-pr main-commit]'
    )
    process.exitCode = 1
  } else {
    prepareOrca34Sync({
      directory,
      tag,
      stage,
      mainPr: pr ? Number(pr) : undefined,
      mainCommit
    }).then(
      (state) => process.stdout.write(`${JSON.stringify(state, null, 2)}\n`),
      (error) => {
        console.error(error instanceof Error ? error.message : String(error))
        process.exitCode = 1
      }
    )
  }
}
