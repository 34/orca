import { mkdtemp, mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import {
  prepareInstallTransaction,
  publishInstallTransaction,
  rollbackUnstartedInstall
} from './orca34-install-transaction.mjs'

const roots = []
afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true })
  }
})
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'orca34-transaction-')))
  roots.push(root)
  const options = {
    candidate: join(root, 'new.app'),
    target: join(root, 'Orca 34.app'),
    profile: join(root, 'profile'),
    commit: 'a'.repeat(40)
  }
  for (const [key, text] of [
    ['candidate', 'new'],
    ['target', 'old'],
    ['profile', 'session']
  ]) {
    await mkdir(options[key])
    await writeFile(join(options[key], 'content'), text)
  }
  const guards = { assertStopped: async () => {}, verifyCandidate: async () => {} }
  const state = await prepareInstallTransaction(options, guards)
  return { options, guards, state }
}

it('backs up paired data, publishes and rolls back without modifying the profile', async () => {
  const { options, guards, state } = await fixture()
  expect((await publishInstallTransaction(state.directory, guards)).phase).toBe('installed')
  expect(await readFile(join(options.target, 'content'), 'utf8')).toBe('new')
  expect((await rollbackUnstartedInstall(state.directory, guards)).phase).toBe('rolled-back')
  expect(await readFile(join(options.target, 'content'), 'utf8')).toBe('old')
  expect(await readFile(join(options.profile, 'content'), 'utf8')).toBe('session')
  expect((await rollbackUnstartedInstall(state.directory, guards)).phase).toBe('rolled-back')
})

it.each([1, 2])('resumes after the process stops following rename %s', async (interruptAfter) => {
  const { options, guards, state } = await fixture()
  let moves = 0
  await expect(
    publishInstallTransaction(state.directory, {
      ...guards,
      move: async (from, to) => {
        await rename(from, to)
        if (++moves === interruptAfter) {
          throw new Error('interrupted')
        }
      }
    })
  ).rejects.toThrow('interrupted')
  expect((await publishInstallTransaction(state.directory, guards)).phase).toBe('installed')
  expect(await readFile(join(options.target, 'content'), 'utf8')).toBe('new')
})

it('can roll back an interrupted replacement before candidate publication', async () => {
  const { options, guards, state } = await fixture()
  await expect(
    publishInstallTransaction(state.directory, {
      ...guards,
      move: async (from, to) => {
        await rename(from, to)
        throw new Error('interrupted')
      }
    })
  ).rejects.toThrow('interrupted')
  await rollbackUnstartedInstall(state.directory, guards)
  expect(await readFile(join(options.target, 'content'), 'utf8')).toBe('old')
})

it('refuses active writers and preserves data written after preparation', async () => {
  const { options, guards, state } = await fixture()
  await expect(
    publishInstallTransaction(state.directory, {
      ...guards,
      assertStopped: async () => {
        throw new Error('live writer')
      }
    })
  ).rejects.toThrow('live writer')
  expect(await readFile(join(options.target, 'content'), 'utf8')).toBe('old')
  await publishInstallTransaction(state.directory, guards)
  await writeFile(join(options.profile, 'content'), 'new user session')
  await expect(rollbackUnstartedInstall(state.directory, guards)).rejects.toThrow(
    'changed unexpectedly'
  )
  expect(await readFile(join(options.profile, 'content'), 'utf8')).toBe('new user session')
  expect(await readFile(join(options.target, 'content'), 'utf8')).toBe('new')
})
