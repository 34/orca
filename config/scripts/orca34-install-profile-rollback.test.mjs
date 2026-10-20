import { mkdtemp, mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { acquireOrca34UpgradeLease } from '../../src/main/startup/orca34-install-access'
import { acquireProfileStateRuntimeAdmission } from '../../src/main/persistence/profile-state/profile-state-access'
import {
  prepareInstallTransaction,
  publishInstallTransaction,
  readInstallTransaction
} from './orca34-install-transaction.mjs'
import { rollbackInstallWithProfile } from './orca34-install-profile-rollback.mjs'

const roots = []
afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true })
  }
})
function guardsFor(lease) {
  return {
    assertStopped: async () => lease.assertActive(),
    verifyCandidate: async () => {},
    protectRestore: (state) => lease.protectRestore(state.directory),
    finishRestore: (state) => lease.finishRestore(state.directory)
  }
}
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'orca34-profile-rollback-')))
  roots.push(root)
  const options = {
    candidate: join(root, 'new.app'),
    target: join(root, 'Orca 34.app'),
    profile: join(root, 'profile'),
    commit: 'a'.repeat(40)
  }
  for (const [key, text] of [
    ['candidate', 'new app'],
    ['target', 'old app'],
    ['profile', 'old data']
  ]) {
    await mkdir(options[key])
    await writeFile(join(options[key], 'content'), text)
  }
  const lease = acquireOrca34UpgradeLease(options.target, options.profile, root)
  let state
  try {
    state = await prepareInstallTransaction(options, guardsFor(lease))
    await publishInstallTransaction(state.directory, guardsFor(lease))
  } finally {
    lease.release()
  }
  await writeFile(join(options.profile, 'content'), 'upgraded data')
  await writeFile(join(options.profile, 'new-file'), 'new user work')
  return { root, options, state }
}

it('preserves upgraded data and restores the paired profile without replacing ownership', async () => {
  const { root, options, state } = await fixture()
  const lease = acquireOrca34UpgradeLease(options.target, options.profile, root, state.directory)
  try {
    const result = await rollbackInstallWithProfile(state.directory, guardsFor(lease))
    expect(result.phase).toBe('rolled-back')
    expect(await readFile(join(options.profile, 'content'), 'utf8')).toBe('old data')
    expect(await readFile(join(options.target, 'content'), 'utf8')).toBe('old app')
    expect(
      await readFile(
        join(result.profileRecoveryDirectory, 'after-profile', 'contents', 'new-file'),
        'utf8'
      )
    ).toBe('new user work')
  } finally {
    lease.release()
  }
  acquireProfileStateRuntimeAdmission(options.profile).release()
})

it.each([1, 2, 3, 4, 5])(
  'keeps the durable admission fence after interrupted move %s, then resumes',
  async (interruptAfter) => {
    const { root, options, state } = await fixture()
    const lease = acquireOrca34UpgradeLease(options.target, options.profile, root, state.directory)
    let moves = 0
    try {
      await expect(
        rollbackInstallWithProfile(state.directory, {
          ...guardsFor(lease),
          move: async (from, to) => {
            await rename(from, to)
            if (++moves === interruptAfter) {
              throw new Error('process interrupted')
            }
          }
        })
      ).rejects.toThrow('process interrupted')
    } finally {
      lease.release()
    }
    expect(() => acquireProfileStateRuntimeAdmission(options.profile)).toThrow('unverifiable')
    expect(() =>
      acquireOrca34UpgradeLease(options.target, options.profile, root, join(root, 'wrong'))
    ).toThrow('different installation')
    const resumed = acquireOrca34UpgradeLease(
      options.target,
      options.profile,
      root,
      state.directory
    )
    try {
      expect((await rollbackInstallWithProfile(state.directory, guardsFor(resumed))).phase).toBe(
        'rolled-back'
      )
      expect(await readFile(join(options.profile, 'content'), 'utf8')).toBe('old data')
      expect(await readFile(join(options.target, 'content'), 'utf8')).toBe('old app')
    } finally {
      resumed.release()
    }
    acquireProfileStateRuntimeAdmission(options.profile).release()
  }
)

it('does not discard unexpected files introduced during interrupted recovery', async () => {
  const { root, options, state } = await fixture()
  const lease = acquireOrca34UpgradeLease(options.target, options.profile, root, state.directory)
  try {
    await expect(
      rollbackInstallWithProfile(state.directory, {
        ...guardsFor(lease),
        move: async (from, to) => {
          await rename(from, to)
          throw new Error('interrupted')
        }
      })
    ).rejects.toThrow('interrupted')
  } finally {
    lease.release()
  }
  await writeFile(join(options.profile, 'unexpected'), 'keep')
  const resumed = acquireOrca34UpgradeLease(options.target, options.profile, root, state.directory)
  try {
    await expect(rollbackInstallWithProfile(state.directory, guardsFor(resumed))).rejects.toThrow(
      'Unrecorded'
    )
    expect(await readFile(join(options.profile, 'unexpected'), 'utf8')).toBe('keep')
    expect((await readInstallTransaction(state.directory)).phase).toBe('profile-displacing')
  } finally {
    resumed.release()
  }
})

it('recovers after an installer process exits without releasing either ownership lease', async () => {
  const { root, options, state } = await fixture()
  const { runProcess } = await import('@orca/process-host')
  const access = new URL('../../src/main/startup/orca34-install-access.ts', import.meta.url).href
  const rollback = new URL('./orca34-install-profile-rollback.mjs', import.meta.url).href
  const script = `
    import {rename} from 'node:fs/promises';
    import {acquireOrca34UpgradeLease} from ${JSON.stringify(access)};
    import {rollbackInstallWithProfile} from ${JSON.stringify(rollback)};
    const [home,target,profile,directory] = process.argv.slice(1);
    const lease=acquireOrca34UpgradeLease(target,profile,home,directory);
    await rollbackInstallWithProfile(directory,{
      assertStopped:async()=>lease.assertActive(),
      protectRestore:s=>lease.protectRestore(s.directory),
      finishRestore:s=>lease.finishRestore(s.directory),
      move:async(from,to)=>{await rename(from,to);process.exit(17)}
    });
  `
  const result = await runProcess({
    program: process.execPath,
    args: [
      '--import',
      'tsx',
      '--input-type=module',
      '-e',
      script,
      root,
      options.target,
      options.profile,
      state.directory
    ],
    timeoutMs: 30000,
    maxOutputBytes: 8192
  })
  expect(result.code, result.stderr).toBe(17)
  expect(() => acquireProfileStateRuntimeAdmission(options.profile)).toThrow('unverifiable')
  const resumed = acquireOrca34UpgradeLease(options.target, options.profile, root, state.directory)
  try {
    expect((await rollbackInstallWithProfile(state.directory, guardsFor(resumed))).phase).toBe(
      'rolled-back'
    )
    expect(await readFile(join(options.profile, 'content'), 'utf8')).toBe('old data')
  } finally {
    resumed.release()
  }
  acquireProfileStateRuntimeAdmission(options.profile).release()
})
