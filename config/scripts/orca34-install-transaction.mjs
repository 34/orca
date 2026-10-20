import { lstat, mkdtemp, readFile, realpath, rename } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import {
  assertSeparateInstallPaths,
  createInstallSnapshot,
  inspectInstallTree,
  verifyInstallSnapshot,
  writeInstallReceipt
} from './orca34-install-snapshot.mjs'

async function exists(path) {
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

async function assertTree(path, entries, excludeProfileAccess = false) {
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

async function save(state, phase) {
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
  await save(state, 'preparing')
  await createInstallSnapshot(target, join(directory, 'previous-app'))
  await createInstallSnapshot(profile, join(directory, 'previous-profile'), {
    excludeProfileAccess: true
  })
  await createInstallSnapshot(candidate, join(directory, 'next-app'))
  await assertStopped(state)
  const oldApp = await verifyInstallSnapshot(join(directory, 'previous-app'))
  const oldProfile = await verifyInstallSnapshot(join(directory, 'previous-profile'))
  await assertTree(target, oldApp.entries)
  await assertTree(profile, oldProfile.entries, true)
  await save(state, 'prepared')
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
  await assertTree(state.profile, oldProfile.entries, true)
  if (state.phase === 'prepared') {
    await verifyInstallSnapshot(join(directory, 'next-app'))
    await assertTree(state.target, old.entries)
    if (await exists(previous)) {
      throw new Error('Unexpected original application in prepared transaction')
    }
    await save(state, 'replacing')
  }
  if (!(await exists(previous))) {
    await assertTree(state.target, old.entries)
    await assertStopped(state)
    await move(state.target, previous)
  }
  await assertTree(previous, old.entries)
  if (await exists(staged)) {
    await assertTree(staged, next.entries)
    if (await exists(state.target)) {
      throw new Error('Installation destination was recreated; preserve it for inspection')
    }
    await assertStopped(state)
    await move(staged, state.target)
  } else {
    await assertTree(state.target, next.entries)
  }
  await assertTree(state.target, next.entries)
  await save(state, 'installed')
  return state
}

export async function rollbackUnstartedInstall(directory, { assertStopped, move = rename }) {
  const state = await readInstallTransaction(directory)
  if (!['replacing', 'installed', 'rolling-back', 'rolled-back'].includes(state.phase)) {
    throw new Error(`Cannot roll back installation in phase ${state.phase}`)
  }
  await assertStopped(state)
  const old = await verifyInstallSnapshot(join(directory, 'previous-app'))
  const oldProfile = await verifyInstallSnapshot(join(directory, 'previous-profile'))
  // A changed profile needs explicit paired-data recovery, never an implicit overwrite.
  await assertTree(state.profile, oldProfile.entries, true)
  const previous = join(directory, 'original.app')
  const rejected = join(directory, 'rejected.app')
  if (state.phase === 'rolled-back') {
    await assertTree(state.target, old.entries)
    return state
  }
  await save(state, 'rolling-back')
  if (await exists(previous)) {
    await assertTree(previous, old.entries)
    if (await exists(state.target)) {
      const next = JSON.parse(await readFile(join(directory, 'next-app', 'snapshot.json'), 'utf8'))
      await assertTree(state.target, next.entries)
      if (await exists(rejected)) {
        throw new Error('Rejected candidate already exists; refusing to overwrite it')
      }
      await assertStopped(state)
      await move(state.target, rejected)
    }
    await assertStopped(state)
    await move(previous, state.target)
  }
  await assertTree(state.target, old.entries)
  await save(state, 'rolled-back')
  return state
}
