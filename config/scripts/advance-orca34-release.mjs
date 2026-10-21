import assert from 'node:assert/strict'
import { nextOrca34Notice } from './orca34-release-notice.mjs'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runProcess } from '@orca/process-host'
import { planOrca34Sync, assertOrca34SyncPlan } from './plan-orca34-sync.mjs'
import { checkoutOrca34Sync } from './checkout-orca34-sync.mjs'
import { advanceOrca34Sync } from './advance-orca34-sync.mjs'
import { createSyncGit } from './orca34-sync-git.mjs'
import { withUpstreamReleaseLease } from './orca34-upstream-record.mjs'
import { writeInstallReceipt } from './orca34-install-snapshot.mjs'

function description(plan, stage) {
  const base = stage === 'main' ? 'main' : '34/local'
  return `${[
    '## ELI5',
    `Bring official ${plan.release.tag} updates into ${base} while retaining fork changes.`,
    '## What Changed',
    `Merge the pinned official release ${plan.release.commit}${stage === 'local' ? ' through the checked main candidate' : ''}.`,
    '## Why',
    'Preserve both histories and review conflicts on a temporary branch before advancing the long-lived branch.',
    '## Testing',
    'Local frozen dependency installation, typecheck and changed-code checks passed before commit. Full PR CI must still pass for this exact head. No application was installed.'
  ].join('\n')}\n`
}

// Candidate-only orchestration: merging and installing remain separate, explicitly enabled actions.
export async function advanceOrca34Release(
  directory,
  {
    plan = planOrca34Sync,
    checkout = checkoutOrca34Sync,
    advance = advanceOrca34Sync,
    run = runProcess
  } = {}
) {
  directory = resolve(directory)
  return withUpstreamReleaseLease(join(directory, 'automation'), async (_root, lease) => {
    const path = join(directory, 'release-run.json')
    let state
    try {
      state = JSON.parse(await readFile(path, 'utf8'))
      assert.equal(state.schemaVersion, 1)
      assert.equal(state.directory, directory)
      assert.notEqual(state.phase, 'fetching-main', 'Previous main fetch is unverifiable')
      assert.notEqual(state.phase, 'unverifiable', 'Previous main fetch is unverifiable')
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error
      }
    }
    state ??= { schemaVersion: 1, directory, phase: 'pending' }
    const save = async (phase, notice = null) => {
      lease.assertActive()
      state.phase = phase
      state.notice = notice
      state.notification = nextOrca34Notice(
        state.notification,
        notice
          ? {
              kind: notice.kind,
              message: notice.message,
              context: JSON.stringify({
                tag: state.tag ?? null,
                phase,
                head: phase === 'waiting-main' ? state.main?.head : state.local?.head
              })
            }
          : null
      )
      await writeInstallReceipt(path, state)
      return state
    }
    try {
      await save('discovering')
      const fixed = await plan(directory)
      assertOrca34SyncPlan(fixed, fixed.release)
      state.tag = fixed.release.tag
      const input = { directory, tag: state.tag }
      await save('main')
      const mainSource = await checkout({ ...input, stage: 'main' }, { run })
      const main = await advance({
        ...input,
        stage: 'main',
        source: mainSource.source,
        body: description(fixed, 'main')
      })
      state.main = main
      delete state.local
      delete state.candidate
      if (main.phase !== 'ready') {
        return save(
          'waiting-main',
          main.notice ??
            (main.phase === 'already-integrated'
              ? {
                  kind: 'main-evidence-required',
                  message:
                    'Main already contains this release; verified main PR evidence is required before local integration.'
                }
              : null)
        )
      }
      assert.match(main.head, /^[a-f0-9]{40}$/)
      assert(Number.isSafeInteger(main.number) && main.number > 0)
      await save('local')
      const localSource = await checkout({ ...input, stage: 'local' }, { run })
      const { git, text } = createSyncGit(localSource.source, lease, run)
      const present = await git(['cat-file', '-e', `${main.head}^{commit}`], [0, 1, 128])
      if (present.code !== 0) {
        await save('fetching-main')
        await git(['fetch', '--no-tags', mainSource.source, main.head])
        assert.equal(await text(['rev-parse', 'FETCH_HEAD^{commit}']), main.head)
      }
      await save('local')
      const local = await advance({
        ...input,
        stage: 'local',
        source: localSource.source,
        mainPr: main.number,
        mainCommit: main.head,
        body: description(fixed, 'local')
      })
      state.local = local
      if (local.phase !== 'candidate-ready') {
        return save('waiting-local', local.notice)
      }
      assert.equal(typeof local.candidate, 'string')
      assert(local.candidate.length > 0)
      state.candidate = local.candidate
      return save('candidate-ready', { kind: 'candidate-ready', message: local.candidate })
    } catch (error) {
      const failedPhase = state.phase
      delete state.candidate
      await save(failedPhase === 'fetching-main' ? 'unverifiable' : 'failed', {
        kind: 'failed',
        phase: failedPhase,
        message: error.message
      })
      throw error
    }
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [directory, ...extra] = process.argv.slice(2)
  if (!directory || extra.length) {
    console.error('Usage: advance-orca34-release <persistent-state-directory>')
    process.exitCode = 1
  } else {
    advanceOrca34Release(directory).then(
      (state) => process.stdout.write(`${JSON.stringify(state, null, 2)}\n`),
      (error) => {
        console.error(error.message)
        process.exitCode = 1
      }
    )
  }
}
