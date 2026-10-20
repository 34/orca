import assert from 'node:assert/strict'
import { readFile, realpath } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runProcess } from '@orca/process-host'
import { prepareOrca34Candidate } from './prepare-orca34-candidate.mjs'
import { prepareOrca34Sync } from './prepare-orca34-sync.mjs'
import { commitOrca34Sync } from './commit-orca34-sync.mjs'
import { publishOrca34Sync, assertOrca34PrDescription } from './publish-orca34-sync.mjs'
import { repairOrca34Integration } from './repair-orca34-integration.mjs'
import { inspectOrca34MergeAdmission } from './orca34-merge-admission.mjs'
import { withUpstreamReleaseLease } from './orca34-upstream-record.mjs'
import { writeInstallReceipt } from './orca34-install-snapshot.mjs'

async function optionalRecord(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error
    }
    return undefined
  }
}

// Each stage owns its recovery receipt; the runner serializes calls across those stage leases.
export async function advanceOrca34Sync(
  options,
  {
    run = runProcess,
    repair = repairOrca34Integration,
    publish = publishOrca34Sync,
    inspect = inspectOrca34MergeAdmission,
    candidate = prepareOrca34Candidate
  } = {}
) {
  const { tag, stage, body } = options
  assert.match(tag, /^v\d+\.\d+\.\d+$/)
  assert(['main', 'local'].includes(stage))
  assertOrca34PrDescription(body)
  const directory = await realpath(options.directory)
  const source = await realpath(options.source ?? process.cwd())
  const input = { ...options, directory, source }
  return withUpstreamReleaseLease(join(directory, 'runner'), async (_root, lease) => {
    const folder = join(directory, 'sync', tag)
    assert.equal(await realpath(folder), folder)
    const path = join(folder, `${stage}-run.json`)
    const identity = {
      source,
      tag,
      stage,
      mainPr: options.mainPr ?? null,
      mainCommit: options.mainCommit ?? null
    }
    const state = (await optionalRecord(path)) ?? {
      schemaVersion: 1,
      identity,
      phase: 'pending',
      notice: null
    }
    assert.equal(state.schemaVersion, 1)
    assert.deepEqual(state.identity, identity, 'Sync runner identity changed')
    const save = async (phase) => {
      lease.assertActive()
      state.phase = phase
      await writeInstallReceipt(path, state)
    }
    delete state.candidate
    try {
      const committed = await optionalRecord(join(folder, `${stage}-commit.json`))
      if (committed?.phase !== 'committed') {
        await save('preparing')
        let prepared = await prepareOrca34Sync(input, { run, inspect })
        if (prepared.phase === 'already-integrated') {
          state.notice = null
          await save('already-integrated')
          return state
        }
        if (prepared.phase === 'conflicted') {
          await save('repairing')
          await repair({ directory, source, head: prepared.base, target: prepared.target }, { run })
          prepared = await prepareOrca34Sync(input, { run, inspect })
          assert.equal(prepared.phase, 'prepared', 'Repair did not resolve the merge')
        }
      }
      await save('committing')
      const commit = await commitOrca34Sync(input, { run })
      state.head = commit.commit
      await save('publishing')
      const publication = await publish(input, { run })
      assert.equal(publication.identity.head, commit.commit)
      assert.equal(publication.identity.baseCommit, commit.base)
      assert.equal(publication.phase, 'published')
      state.number = publication.number
      state.url = publication.url
      await save('checking')
      const evidence = await inspect(state.number, state.head)
      assert.equal(evidence.head, state.head, 'CI inspected a different head')
      assert.equal(evidence.base, commit.base, 'CI inspected a different base')
      assert(['passed', 'pending', 'blocked'].includes(evidence.state))
      state.evidence = evidence
      state.notice =
        evidence.state === 'blocked' ? { kind: 'checks-blocked', message: evidence.reason } : null
      await save(evidence.state === 'passed' ? 'ready' : 'waiting')
      if (stage === 'local' && evidence.state === 'passed') {
        await save('building')
        const built = await candidate({
          directory,
          source,
          number: state.number,
          commit: state.head
        })
        assert.equal(built.commit, state.head, 'Built a different candidate commit')
        assert.equal(built.source, source, 'Built from a different checkout')
        assert.equal(built.number, state.number, 'Built for a different PR')
        assert(['verified', 'waiting'].includes(built.phase))
        if (built.phase === 'verified') {
          state.candidate = built.candidate
          state.notice = { kind: 'candidate-ready', message: built.candidate }
        } else {
          state.notice = built.notice?.active ? built.notice : null
        }
        await save(built.phase === 'verified' ? 'candidate-ready' : 'waiting')
      }
      return state
    } catch (error) {
      state.notice = { kind: 'failed', phase: state.phase, message: error.message }
      await save('failed')
      throw error
    }
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [directory, tag, stage, bodyFile, mainPr, mainCommit, ...extra] = process.argv.slice(2)
  if (!bodyFile || extra.length || (stage === 'local' && (!mainPr || !mainCommit))) {
    console.error(
      'Usage: advance-orca34-sync <state-directory> <tag> <main|local> <pr-description-file> [main-pr main-sha]'
    )
    process.exitCode = 1
  } else {
    readFile(bodyFile, 'utf8')
      .then((body) =>
        advanceOrca34Sync({
          directory,
          tag,
          stage,
          body,
          mainPr: mainPr ? Number(mainPr) : undefined,
          mainCommit
        })
      )
      .then(
        (state) => process.stdout.write(`${JSON.stringify(state, null, 2)}\n`),
        (error) => {
          console.error(error.message)
          process.exitCode = 1
        }
      )
  }
}
