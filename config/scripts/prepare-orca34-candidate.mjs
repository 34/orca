import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildOrca34MacCandidate } from './build-orca34-mac.mjs'
import { discoverOfficialRelease } from './orca34-upstream-discovery.mjs'
import { observeOfficialRelease, withUpstreamReleaseLease } from './orca34-upstream-record.mjs'
import { inspectOrca34PrWorkflow } from './orca34-pr-workflow-evidence.mjs'
import { writeInstallReceipt } from './orca34-install-snapshot.mjs'
import { verifyOrca34InstallCandidate } from './verify-orca34-install-candidate.mjs'

function assertCandidateSource(source, commit, release) {
  const git = (args) => execFileSync('git', args, { cwd: source, encoding: 'utf8' }).trim()
  assert.equal(git(['rev-parse', 'HEAD']), commit, 'Candidate source commit changed')
  assert.equal(git(['status', '--porcelain']), '', 'Candidate source must be clean')
  git(['merge-base', '--is-ancestor', release.commit, commit])
}

// Builds a local candidate only; successful evidence never grants merge or installation permission.
export async function prepareOrca34Candidate(
  { directory, number, commit },
  {
    discover = discoverOfficialRelease,
    inspect = inspectOrca34PrWorkflow,
    build = buildOrca34MacCandidate,
    verify = verifyOrca34InstallCandidate,
    assertSource = assertCandidateSource
  } = {}
) {
  assert(Number.isSafeInteger(number) && number > 0, 'Expected a PR number')
  assert.match(commit, /^[a-f0-9]{40}$/, 'Expected the full candidate commit')
  const source = await realpath(process.cwd())
  return withUpstreamReleaseLease(directory, async (root, lease) => {
    const release = await discover()
    const observation = await observeOfficialRelease(root, release, lease)
    assert.notEqual(observation.disposition, 'older-release', 'Official latest moved backwards')
    const candidateRoot = join(root, 'candidates', commit)
    await mkdir(candidateRoot, { recursive: true, mode: 0o700 })
    assert.equal(await realpath(candidateRoot), candidateRoot, 'Candidate state must be canonical')
    const receipt = join(candidateRoot, 'candidate.json')
    let state
    try {
      state = JSON.parse(await readFile(receipt, 'utf8'))
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error
      }
      state = { schemaVersion: 1, source, number, commit, release, phase: 'waiting' }
    }
    assert.equal(state.schemaVersion, 1)
    for (const [key, value] of Object.entries({ source, number, commit })) {
      assert.equal(state[key], value, `Candidate ${key} changed`)
    }
    assert.equal(state.release.tag, release.tag, 'Candidate targets a different official release')
    assert.equal(state.release.commit, release.commit, 'Official release commit changed')
    assert(['waiting', 'building', 'built', 'verified', 'failed'].includes(state.phase))
    if (state.output) {
      assert.equal(await realpath(state.output), state.output)
      assert.equal(
        resolve(state.output, '..'),
        candidateRoot,
        'Build output escaped candidate state'
      )
      assert.equal(state.candidate, join(state.output, 'mac-arm64', 'Orca 34.app'))
    }
    const save = async () => {
      lease.assertActive()
      await writeInstallReceipt(receipt, state)
    }
    try {
      assertSource(source, commit, release)
      const evidence = await inspect(number, commit)
      assert.equal(evidence.head, commit)
      state.evidence = evidence
      delete state.error
      if (evidence.state !== 'passed') {
        state.phase = 'waiting'
        await save()
        return state
      }
      if (!state.built) {
        state.output = await mkdtemp(join(candidateRoot, 'build-'))
        state.candidate = join(state.output, 'mac-arm64', 'Orca 34.app')
        state.phase = 'building'
        await save()
        lease.assertActive()
        const result = await build({ output: state.output, expectedCommit: commit })
        assert.equal(result.commit, commit)
        assert.equal(result.candidate, state.candidate)
        assertSource(source, commit, release)
        await verify(state.candidate, commit)
        state.built = true
        state.phase = 'built'
        await save()
      }
      await verify(state.candidate, commit)
      assertSource(source, commit, release)
      const refreshed = await inspect(number, commit)
      assert.deepEqual(
        refreshed,
        evidence,
        'CI evidence changed during candidate preparation; retry'
      )
      state.phase = 'verified'
      await save()
      return state
    } catch (error) {
      state.phase = 'failed'
      state.error = error instanceof Error ? error.message : String(error)
      await save()
      throw error
    }
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [directory, number, commit, ...extra] = process.argv.slice(2)
  if (!directory || !number || !commit || extra.length) {
    console.error(
      'Usage: prepare-orca34-candidate <persistent-state-directory> <PR-number> <source-sha>'
    )
    process.exitCode = 1
  } else {
    prepareOrca34Candidate({ directory, number: Number(number), commit }).then(
      (state) => process.stdout.write(`${JSON.stringify(state, null, 2)}\n`),
      (error) => {
        console.error(error instanceof Error ? error.message : String(error))
        process.exitCode = 1
      }
    )
  }
}
