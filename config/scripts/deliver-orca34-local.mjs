import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { tsImport } from 'tsx/esm/api'
import { buildOrca34MacCandidate } from './build-orca34-mac.mjs'
import { runLocalInstall } from './install-orca34-local.mjs'
import { readInstallTransaction } from './orca34-install-transaction.mjs'
import { assertSeparateInstallPaths, writeInstallReceipt } from './orca34-install-snapshot.mjs'
import { verifyOrca34InstallCandidate } from './verify-orca34-install-candidate.mjs'

const phases = ['created', 'building', 'built', 'prepared', 'installed', 'healthy']

export async function readLocalDelivery(directory) {
  assert.equal(await realpath(directory), directory, 'Delivery directory must be canonical')
  const state = JSON.parse(await readFile(join(directory, 'delivery.json'), 'utf8'))
  assert.equal(state.schemaVersion, 1)
  assert.equal(state.directory, directory)
  assert.match(state.commit, /^[a-f0-9]{40}$/)
  assert(phases.includes(state.phase), 'Unknown delivery phase')
  assertSeparateInstallPaths([directory, state.target, state.profile])
  if (state.candidateMode === true) {
    assert(!['created', 'building'].includes(state.phase), 'An adopted candidate cannot be rebuilt')
    assert.equal(await realpath(state.candidate), state.candidate)
    assertSeparateInstallPaths([directory, state.target, state.profile, state.candidate])
  } else if (state.candidate) {
    assert.equal(dirname(dirname(state.candidate)), state.output, 'Unexpected candidate location')
    assert.equal(dirname(state.output), directory, 'Build output escaped delivery directory')
  }
  return state
}

export async function continueLocalDelivery(
  directory,
  {
    build = buildOrca34MacCandidate,
    install = runLocalInstall,
    verify = verifyOrca34InstallCandidate,
    readTransaction = readInstallTransaction,
    assertActive = () => {}
  } = {}
) {
  const state = await readLocalDelivery(directory)
  const save = async (phase) => {
    assertActive()
    state.phase = phase
    await writeInstallReceipt(join(directory, 'delivery.json'), state)
  }
  if (['created', 'building'].includes(state.phase)) {
    assert.equal(await realpath(process.cwd()), state.source, 'Resume from the recorded source')
    // Interrupted builds remain intact; only a fresh attempt may become an install candidate.
    state.output = await mkdtemp(join(directory, 'build-'))
    await save('building')
    const built = build({ output: state.output, expectedCommit: state.commit })
    assert.equal(built.commit, state.commit)
    assert.equal(built.candidate, join(state.output, 'mac-arm64', 'Orca 34.app'))
    state.candidate = built.candidate
    verify(state.candidate, state.commit)
    await save('built')
  }
  if (state.phase === 'built') {
    assertActive()
    verify(state.candidate, state.commit)
    const prepared = await install([
      'prepare',
      state.candidate,
      state.commit,
      state.target,
      state.profile
    ])
    state.transaction = prepared.directory
    await save('prepared')
  }
  const transaction = await readTransaction(state.transaction)
  for (const key of ['target', 'profile', 'commit']) {
    assert.equal(transaction[key], state[key], `Installation ${key} does not match delivery`)
  }
  if (state.phase === 'prepared') {
    assertActive()
    await install(['resume', state.transaction])
    await save('installed')
  }
  assert.equal(
    (await readTransaction(state.transaction)).phase,
    'installed',
    'Delivery transaction was rolled back or is incomplete'
  )
  if (state.phase === 'installed') {
    assertActive()
    state.health = await install(['health', state.transaction])
    assert.equal(state.health.status, 'passed', 'Candidate health check did not pass')
    await save('healthy')
  }
  verify(state.target, state.commit)
  return state
}

export async function runLocalDelivery(args, dependencies = {}) {
  const [command, rawDirectory] = args
  const [target, profile] = command === 'candidate' ? args.slice(4) : args.slice(2)
  if (
    !rawDirectory ||
    !(
      (command === 'start' && args.length === 4) ||
      (command === 'candidate' && args.length === 6) ||
      (['resume', 'status'].includes(command) && args.length === 2)
    )
  ) {
    throw new Error(
      'Usage: start <new-delivery-directory> <installed.app> <user-data> OR candidate <new-delivery-directory> <candidate.app> <sha> <installed.app> <user-data> OR resume|status <delivery-directory>'
    )
  }
  const directory = resolve(rawDirectory)
  if (command === 'start' || command === 'candidate') {
    assert.equal(await realpath(dirname(directory)), dirname(directory))
    const state = {
      schemaVersion: 1,
      directory,
      ...(command === 'candidate'
        ? { candidateMode: true, candidate: await realpath(resolve(args[2])), commit: args[3] }
        : {
            source: await realpath(process.cwd()),
            commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
          }),
      target: await realpath(resolve(target)),
      profile: await realpath(resolve(profile)),
      phase: command === 'candidate' ? 'built' : 'created'
    }
    assertSeparateInstallPaths([directory, state.target, state.profile])
    if (state.candidateMode) {
      assertSeparateInstallPaths([directory, state.target, state.profile, state.candidate])
      await (dependencies.verify ?? verifyOrca34InstallCandidate)(state.candidate, state.commit)
    }
    await mkdir(directory, { mode: 0o700 })
    await writeInstallReceipt(join(directory, 'delivery.json'), state)
  }
  if (command === 'status') {
    return readLocalDelivery(directory)
  }
  await readLocalDelivery(directory)
  const { acquireProfileStateMaintenance } = await tsImport(
    '../../src/main/persistence/profile-state/profile-state-access.ts',
    import.meta.url
  )
  const lease = acquireProfileStateMaintenance(directory)
  try {
    return await continueLocalDelivery(directory, {
      ...dependencies,
      assertActive: () => lease.assertActive()
    })
  } finally {
    lease.release()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runLocalDelivery(process.argv.slice(2)).then(
    (result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`),
    (error) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    }
  )
}
