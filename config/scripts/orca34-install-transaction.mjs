import { lstat, mkdtemp, readFile, realpath, rename } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import {
  assertSeparateInstallPaths,
  createInstallSnapshot,
  inspectInstallTree,
  verifyInstallSnapshot,
  writeInstallReceipt
} from './orca34-install-snapshot.mjs'

export async function installPathExists(path) {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false
    }
    throw error
  }
}

export async function assertInstallTree(path, entries, excludeProfileAccess = false) {
  if (
    JSON.stringify(await inspectInstallTree(path, { excludeProfileAccess })) !==
    JSON.stringify(entries)
  ) {
    throw new Error(`Installation files changed unexpectedly: ${path}`)
  }
}

export async function readInstallTransaction(directory) {
  if ((await realpath(directory)) !== resolve(directory)) {
    throw new Error('Installation transaction path must be canonical')
  }
  const state = JSON.parse(await readFile(join(directory, 'transaction.json'), 'utf8'))
  if (
    state.schemaVersion !== 1 ||
    state.directory !== directory ||
    typeof state.target !== 'string' ||
    typeof state.profile !== 'string'
  ) {
    throw new Error('Invalid installation transaction')
  }
  assertSeparateInstallPaths([directory, state.target, state.profile])
  if (dirname(state.target) !== dirname(directory)) {
    throw new Error('Installation transaction must be beside the application')
  }
  return state
}

export async function saveInstallPhase(state, phase) {
  await writeInstallReceipt(join(state.directory, 'transaction.json'), { ...state, phase })
  state.phase = phase
}

// The caller owns the install lease and stopped-writer proof for the entire operation.
export async function prepareInstallTransaction(
  { candidate, target, profile, commit },
  { assertStopped, verifyCandidate }
) {
  for (const path of [candidate, target, profile]) {
    if ((await realpath(path)) !== resolve(path) || !(await lstat(path)).isDirectory()) {
      throw new Error('Installation requires canonical existing directories')
    }
  }
  assertSeparateInstallPaths([candidate, target, profile])
  await verifyCandidate(candidate, commit)
  await assertStopped({ target, profile })
  const directory = await mkdtemp(join(dirname(target), '.orca34-install-'))
  assertSeparateInstallPaths([directory, candidate, target, profile])
  const state = {
    schemaVersion: 1,
    directory,
    candidate,
    target,
    profile,
    commit,
    phase: 'preparing'
  }
  await saveInstallPhase(state, 'preparing')
  await createInstallSnapshot(target, join(directory, 'previous-app'))
  await createInstallSnapshot(profile, join(directory, 'previous-profile'), {
    excludeProfileAccess: true
  })
  await createInstallSnapshot(candidate, join(directory, 'next-app'))
  await assertStopped(state)
  const oldApp = await verifyInstallSnapshot(join(directory, 'previous-app'))
  const oldProfile = await verifyInstallSnapshot(join(directory, 'previous-profile'))
  await assertInstallTree(target, oldApp.entries)
  await assertInstallTree(profile, oldProfile.entries, true)
  await saveInstallPhase(state, 'prepared')
  return state
}

export async function publishInstallTransaction(directory, { assertStopped, move = rename }) {
  const state = await readInstallTransaction(directory)
  if (!['prepared', 'replacing', 'installed'].includes(state.phase)) {
    throw new Error(`Cannot publish installation in phase ${state.phase}`)
  }
  await assertStopped(state)
  const previous = join(directory, 'original.app')
  const staged = join(directory, 'next-app', 'contents')
  const next = JSON.parse(await readFile(join(directory, 'next-app', 'snapshot.json'), 'utf8'))
  const old = await verifyInstallSnapshot(join(directory, 'previous-app'))
  const oldProfile = await verifyInstallSnapshot(join(directory, 'previous-profile'))
  await assertInstallTree(state.profile, oldProfile.entries, true)
  if (state.phase === 'prepared') {
    await verifyInstallSnapshot(join(directory, 'next-app'))
    await assertInstallTree(state.target, old.entries)
    if (await installPathExists(previous)) {
      throw new Error('Unexpected original application in prepared transaction')
    }
    await saveInstallPhase(state, 'replacing')
  }
  if (!(await installPathExists(previous))) {
    await assertInstallTree(state.target, old.entries)
    await assertStopped(state)
    await move(state.target, previous)
  }
  await assertInstallTree(previous, old.entries)
  if (await installPathExists(staged)) {
    await assertInstallTree(staged, next.entries)
    if (await installPathExists(state.target)) {
      throw new Error('Installation destination was recreated; preserve it for inspection')
    }
    await assertStopped(state)
    await move(staged, state.target)
  } else {
    await assertInstallTree(state.target, next.entries)
  }
  await assertInstallTree(state.target, next.entries)
  await saveInstallPhase(state, 'installed')
  return state
}

export async function rollbackUnstartedInstall(directory, { assertStopped, move = rename }) {
  const state = await readInstallTransaction(directory)
  if (
    !['replacing', 'installed', 'profile-restored', 'rolling-back', 'rolled-back'].includes(
      state.phase
    )
  ) {
    throw new Error(`Cannot roll back installation in phase ${state.phase}`)
  }
  await assertStopped(state)
  const old = await verifyInstallSnapshot(join(directory, 'previous-app'))
  const oldProfile = await verifyInstallSnapshot(join(directory, 'previous-profile'))
  // A changed profile needs explicit paired-data recovery, never an implicit overwrite.
  await assertInstallTree(state.profile, oldProfile.entries, true)
  const previous = join(directory, 'original.app')
  const rejected = join(directory, 'rejected.app')
  if (state.phase === 'rolled-back') {
    await assertInstallTree(state.target, old.entries)
    return state
  }
  await saveInstallPhase(state, 'rolling-back')
  if (await installPathExists(previous)) {
    await assertInstallTree(previous, old.entries)
    if (await installPathExists(state.target)) {
      const next = JSON.parse(await readFile(join(directory, 'next-app', 'snapshot.json'), 'utf8'))
      await assertInstallTree(state.target, next.entries)
      if (await installPathExists(rejected)) {
        throw new Error('Rejected candidate already exists; refusing to overwrite it')
      }
      await assertStopped(state)
      await move(state.target, rejected)
    }
    await assertStopped(state)
    await move(previous, state.target)
  }
  await assertInstallTree(state.target, old.entries)
  await saveInstallPhase(state, 'rolled-back')
  return state
}
