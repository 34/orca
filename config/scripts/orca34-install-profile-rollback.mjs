import { randomUUID } from 'node:crypto'
import { chmod, mkdir, mkdtemp, readFile, readdir, realpath, rename } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import {
  createInstallSnapshot,
  verifyInstallSnapshot,
  writeInstallReceipt
} from './orca34-install-snapshot.mjs'
import {
  assertInstallTree,
  installPathExists,
  readInstallTransaction,
  rollbackUnstartedInstall,
  saveInstallPhase
} from './orca34-install-transaction.mjs'

async function snapshotForRestore(source, destination) {
  if (await installPathExists(join(destination, 'snapshot.json'))) {
    return verifyInstallSnapshot(destination)
  }
  if (await installPathExists(destination)) {
    await rename(destination, `${destination}.incomplete-${randomUUID()}`)
  }
  return createInstallSnapshot(source, destination, { excludeProfileAccess: true })
}

function topNames(receipt) {
  return receipt.entries.filter(({ name }) => name && !name.includes('/')).map(({ name }) => name)
}

async function assertEntry(path, entries, name) {
  const subset = entries
    .filter((entry) => entry.name === name || entry.name.startsWith(`${name}/`))
    .map((entry) => ({
      ...entry,
      name: entry.name === name ? '' : entry.name.slice(name.length + 1)
    }))
  await assertInstallTree(path, subset)
}

async function assertProfileNames(profile, allowed) {
  const names = (await readdir(profile)).filter((name) => name !== '.profile-state-access')
  if (names.some((name) => !allowed.includes(name))) {
    throw new Error('Unrecorded profile files appeared during recovery; preserving them')
  }
}

export async function rollbackInstallWithProfile(directory, guards) {
  const state = await readInstallTransaction(directory)
  const allowedPhases = [
    'installed',
    'profile-displacing',
    'profile-publishing',
    'profile-restored',
    'rolling-back',
    'rolled-back'
  ]
  if (!allowedPhases.includes(state.phase)) {
    throw new Error(`Cannot restore profile in phase ${state.phase}`)
  }
  await guards.assertStopped(state)
  const old = await verifyInstallSnapshot(join(directory, 'previous-profile'))
  const oldApp = await verifyInstallSnapshot(join(directory, 'previous-app'))
  if (old.source !== state.profile || oldApp.source !== state.target) {
    throw new Error('Installation snapshots belong to different source paths')
  }
  if (state.phase === 'installed') {
    if (!state.profileRecoveryDirectory) {
      state.profileRecoveryDirectory = await mkdtemp(
        join(dirname(state.profile), '.orca34-profile-restore-')
      )
      await writeInstallReceipt(join(state.profileRecoveryDirectory, 'installation.json'), {
        directory,
        target: state.target,
        profile: state.profile
      })
      await saveInstallPhase(state, 'installed')
    }
  }
  if (state.profileRecoveryDirectory) {
    const recovery = state.profileRecoveryDirectory
    if (
      (await realpath(recovery)) !== recovery ||
      dirname(recovery) !== dirname(state.profile) ||
      recovery === state.profile ||
      !basename(recovery).startsWith('.orca34-profile-restore-')
    ) {
      throw new Error('Profile recovery directory is outside its recorded location')
    }
    const binding = JSON.parse(await readFile(join(recovery, 'installation.json'), 'utf8'))
    if (
      binding.directory !== directory ||
      binding.target !== state.target ||
      binding.profile !== state.profile
    ) {
      throw new Error('Profile recovery directory belongs to a different installation')
    }
    const saved =
      state.phase === 'installed'
        ? await snapshotForRestore(state.profile, join(recovery, 'after-profile'))
        : await verifyInstallSnapshot(join(recovery, 'after-profile'))
    const staged =
      state.phase === 'installed'
        ? await snapshotForRestore(
            join(directory, 'previous-profile', 'contents'),
            join(recovery, 'restore-profile')
          )
        : JSON.parse(await readFile(join(recovery, 'restore-profile', 'snapshot.json'), 'utf8'))
    if (JSON.stringify(staged.entries) !== JSON.stringify(old.entries)) {
      throw new Error('Staged profile differs from its original backup')
    }
    const displaced = join(recovery, 'displaced')
    const source = join(recovery, 'restore-profile', 'contents')
    const move = guards.move ?? rename
    await mkdir(displaced, { recursive: true, mode: 0o700 })
    if (state.phase === 'installed') {
      await assertInstallTree(state.profile, saved.entries, true)
      await guards.assertStopped(state)
      await guards.protectRestore(state)
      await saveInstallPhase(state, 'profile-displacing')
    }
    if (state.phase === 'profile-displacing') {
      await guards.protectRestore(state)
      await assertProfileNames(state.profile, topNames(saved))
      for (const name of topNames(saved)) {
        const from = join(state.profile, name)
        const to = join(displaced, name)
        if (await installPathExists(to)) {
          await assertEntry(to, saved.entries, name)
          if (await installPathExists(from)) {
            throw new Error(`Profile file was recreated during displacement: ${from}`)
          }
        } else {
          await assertEntry(from, saved.entries, name)
          await guards.assertStopped(state)
          await move(from, to)
        }
      }
      await assertProfileNames(state.profile, [])
      await saveInstallPhase(state, 'profile-publishing')
    }
    if (state.phase === 'profile-publishing') {
      await guards.protectRestore(state)
      await assertProfileNames(state.profile, topNames(old))
      for (const name of topNames(old)) {
        const from = join(source, name)
        const to = join(state.profile, name)
        if (await installPathExists(from)) {
          await assertEntry(from, old.entries, name)
          if (await installPathExists(to)) {
            throw new Error(`Profile destination was recreated: ${to}`)
          }
          await guards.assertStopped(state)
          await move(from, to)
        } else {
          await assertEntry(to, old.entries, name)
        }
      }
      await chmod(state.profile, old.entries[0].mode)
      await assertInstallTree(state.profile, old.entries, true)
      await saveInstallPhase(state, 'profile-restored')
    }
  } else if (!['rolled-back', 'rolling-back', 'profile-restored'].includes(state.phase)) {
    throw new Error('Profile recovery directory is missing')
  }
  await guards.protectRestore(state)
  const result = await rollbackUnstartedInstall(directory, guards)
  await guards.finishRestore(state)
  return result
}
