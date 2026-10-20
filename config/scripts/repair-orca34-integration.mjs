import assert from 'node:assert/strict'
import { mkdir, readFile, realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runProcess } from '@orca/process-host'
import { withUpstreamReleaseLease } from './orca34-upstream-record.mjs'
import { writeInstallReceipt } from './orca34-install-snapshot.mjs'

async function git(source, args, run) {
  const result = await run({
    program: 'git',
    args,
    cwd: source,
    timeoutMs: 30_000,
    maxOutputBytes: 2 * 1024 * 1024
  })
  assert(
    result.code === 0 && !result.timedOut && !result.outputTruncated,
    `Git repair inspection failed: ${result.stderr.slice(0, 500)}`
  )
  return result.stdout.trim()
}

export async function inspectRepairMerge(source, head, target, run = runProcess) {
  assert.equal(await git(source, ['rev-parse', 'HEAD'], run), head, 'Repair HEAD changed')
  assert.equal(await git(source, ['rev-parse', 'ORIG_HEAD'], run), head, 'Merge origin changed')
  assert.equal(await git(source, ['rev-parse', 'MERGE_HEAD'], run), target, 'Merge target changed')
  const branch = await git(source, ['symbolic-ref', '--short', 'HEAD'], run)
  assert(branch.startsWith('codex/'), 'Repair requires an isolated codex/ branch')
  return {
    branch,
    unmerged: await git(source, ['diff', '--name-only', '--diff-filter=U'], run)
  }
}

function repairPrompt(head, target) {
  return [
    `Resolve the current Orca fork integration merge from ${head} with ${target}.`,
    'Read AGENTS.md and the merge-conflict skill when available. Read both sides before resolving.',
    'Preserve the fork requirements and upstream fixes. Resolve semantic regressions, not only markers.',
    'Work only in this checkout. Do not commit, push, switch branches, abort the merge, install, or publish.',
    'Do not delete user files, reset changes, choose whole-tree ours/theirs, weaken tests or CI, or change approval/sandbox settings.',
    'Stage only resolved files. Run relevant focused tests. Do not launch visible apps or background processes.',
    'Set ORCA_BACKGROUND_LAUNCH=1 for tests. Skip real Claude login; Codex and Cursor are the supported agents.',
    'If intent is ambiguous or migration/data safety cannot be verified, leave it unresolved and explain.',
    'Return a concise conflict-by-conflict rationale, tests performed, and remaining failures.'
  ].join('\n')
}

export async function repairOrca34Integration(
  { directory, head, target, source = process.cwd() },
  { run = runProcess, inspect = inspectRepairMerge } = {}
) {
  assert.match(head, /^[a-f0-9]{40}$/)
  assert.match(target, /^[a-f0-9]{40}$/)
  assert.notEqual(head, target)
  source = await realpath(source)
  return withUpstreamReleaseLease(directory, async (root, lease) => {
    const stateRelative = relative(source, root)
    assert(
      stateRelative === '..' || stateRelative.startsWith(`..${sep}`) || isAbsolute(stateRelative),
      'Repair state must be outside the writable source checkout'
    )
    const folder = join(root, 'repairs', `${head}-${target}`)
    await mkdir(folder, { recursive: true, mode: 0o700 })
    assert.equal(await realpath(folder), folder, 'Repair state must be canonical')
    const receipt = join(folder, 'repair.json')
    const merge = await inspect(source, head, target)
    let state
    try {
      state = JSON.parse(await readFile(receipt, 'utf8'))
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error
      }
      state = { schemaVersion: 1, source, head, target, branch: merge.branch, attempts: [] }
    }
    assert.equal(state.schemaVersion, 1)
    for (const [key, value] of Object.entries({ source, head, target, branch: merge.branch })) {
      assert.equal(state[key], value, `Repair ${key} changed`)
    }
    assert(Array.isArray(state.attempts) && state.attempts.length <= 3)
    for (const attempt of state.attempts) {
      assert(['running', 'failed', 'resolved'].includes(attempt.phase), 'Invalid repair attempt')
    }
    assert(
      !state.attempts.some((attempt) => attempt.phase === 'running'),
      'Interrupted repair has an unverifiable child; reconcile it before another attempt'
    )
    if (state.attempts.at(-1)?.phase === 'resolved') {
      assert.equal(merge.unmerged, '', 'Conflicts reappeared after repair')
      return state
    }
    assert(state.attempts.length < 3, 'Three repair attempts exhausted; manual review required')
    const attempt = { phase: 'running', startedAt: new Date().toISOString() }
    state.attempts.push(attempt)
    const save = async () => {
      lease.assertActive()
      await writeInstallReceipt(receipt, state)
    }
    await save()
    let terminated = false
    try {
      lease.assertActive()
      const result = await run({
        program: 'codex',
        args: ['exec', '--approve-for-me', '--cd', source, '-'],
        cwd: source,
        env: { ...process.env, ORCA_BACKGROUND_LAUNCH: '1', ORCA_SKIP_DEV_CLI_INSTALL: '1' },
        input: repairPrompt(head, target),
        timeoutMs: 20 * 60_000,
        maxOutputBytes: 2 * 1024 * 1024,
        detached: process.platform !== 'win32',
        terminationBarrier: true,
        onChildTerminated: () => {
          terminated = true
        }
      })
      assert(terminated, 'Repair child exit is unverifiable')
      await writeInstallReceipt(join(folder, `attempt-${state.attempts.length}.json`), result)
      assert(
        result.code === 0 && !result.timedOut && !result.outputTruncated,
        'Agent repair failed'
      )
      const current = await inspect(source, head, target)
      assert.equal(current.branch, state.branch, 'Repair branch changed')
      assert.equal(current.unmerged, '', 'Merge still has unresolved files')
      let checkIndex = 0
      for (const { program, args } of [
        { program: 'git', args: ['diff', '--check'] },
        { program: 'git', args: ['diff', '--cached', '--check'] },
        { program: 'pnpm', args: ['tc'] },
        { program: 'pnpm', args: ['run', 'check:code-quality:changed', head] }
      ]) {
        lease.assertActive()
        terminated = false
        const checked = await run({
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
          join(folder, `attempt-${state.attempts.length}-check-${++checkIndex}.json`),
          { program, args, ...checked }
        )
        assert(
          checked.code === 0 && !checked.timedOut && !checked.outputTruncated,
          `Repair validation failed: ${program} ${args.join(' ')}`
        )
      }
      const checked = await inspect(source, head, target)
      assert.equal(checked.branch, state.branch)
      assert.equal(checked.unmerged, '')
      attempt.phase = 'resolved'
      attempt.completedAt = new Date().toISOString()
      state.phase = 'awaiting-review-and-full-ci'
      await save()
      return state
    } catch (error) {
      attempt.phase = terminated ? 'failed' : 'running'
      attempt.error = error instanceof Error ? error.message : String(error)
      state.phase = terminated ? 'needs-repair' : 'unverifiable'
      await save()
      throw error
    }
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [directory, head, target, ...extra] = process.argv.slice(2)
  if (!directory || !head || !target || extra.length) {
    console.error(
      'Usage: repair-orca34-integration <state-directory> <original-head> <merge-target>'
    )
    process.exitCode = 1
  } else {
    repairOrca34Integration({ directory, head, target }).then(
      (state) => process.stdout.write(`${JSON.stringify(state, null, 2)}\n`),
      (error) => {
        console.error(error instanceof Error ? error.message : String(error))
        process.exitCode = 1
      }
    )
  }
}
