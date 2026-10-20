import { afterEach, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { continueLocalDelivery, readLocalDelivery } from './deliver-orca34-local.mjs'
import { writeInstallReceipt } from './orca34-install-snapshot.mjs'

const roots = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'orca34-delivery-')))
  roots.push(root)
  const directory = join(root, 'release')
  await mkdir(directory)
  const state = {
    schemaVersion: 1,
    directory,
    source: await realpath(process.cwd()),
    target: join(root, 'installed.app'),
    profile: join(root, 'profile'),
    commit: 'a'.repeat(40),
    phase: 'created'
  }
  await writeInstallReceipt(join(directory, 'delivery.json'), state)
  const calls = []
  const dependencies = {
    build: ({ output }) => {
      calls.push('build')
      return { commit: state.commit, candidate: join(output, 'mac-arm64', 'Orca 34.app') }
    },
    install: async ([command]) => {
      calls.push(command)
      return command === 'health' ? { status: 'passed' } : { directory: join(root, 'transaction') }
    },
    verify: () => {},
    readTransaction: async () => ({ ...state, phase: 'installed' })
  }
  return { state, directory, calls, dependencies }
}

it('builds, prepares, records the transaction before replacement, then checks health', async () => {
  const { directory, calls, dependencies } = await fixture()
  const install = dependencies.install
  dependencies.install = async (args) => {
    if (args[0] === 'resume') {
      expect((await readLocalDelivery(directory)).phase).toBe('prepared')
      expect((await readLocalDelivery(directory)).transaction).toBeTruthy()
    }
    return install(args)
  }
  expect((await continueLocalDelivery(directory, dependencies)).phase).toBe('healthy')
  expect(calls).toEqual(['build', 'prepare', 'resume', 'health'])
})

it('resumes an interrupted replacement without rebuilding or taking another backup', async () => {
  const { directory, dependencies, calls } = await fixture()
  const install = dependencies.install
  dependencies.install = async (args) => {
    if (args[0] === 'resume') {
      throw new Error('interrupted')
    }
    return install(args)
  }
  await expect(continueLocalDelivery(directory, dependencies)).rejects.toThrow('interrupted')
  expect((await readLocalDelivery(directory)).phase).toBe('prepared')
  calls.length = 0
  dependencies.install = install
  await continueLocalDelivery(directory, dependencies)
  expect(calls).toEqual(['resume', 'health'])
})

it('retains a failed health stage and retries only health', async () => {
  const { directory, dependencies, calls } = await fixture()
  const install = dependencies.install
  dependencies.install = async (args) => {
    if (args[0] === 'health') {
      throw new Error('unhealthy')
    }
    return install(args)
  }
  await expect(continueLocalDelivery(directory, dependencies)).rejects.toThrow('unhealthy')
  expect((await readLocalDelivery(directory)).phase).toBe('installed')
  calls.length = 0
  dependencies.install = install
  await continueLocalDelivery(directory, dependencies)
  expect(calls).toEqual(['health'])
})

it('keeps an interrupted build directory and uses a new output on retry', async () => {
  const { directory, dependencies } = await fixture()
  const build = dependencies.build
  dependencies.build = () => {
    throw new Error('build interrupted')
  }
  await expect(continueLocalDelivery(directory, dependencies)).rejects.toThrow('build interrupted')
  const before = await readLocalDelivery(directory)
  dependencies.build = build
  const after = await continueLocalDelivery(directory, dependencies)
  expect(after.output).not.toBe(before.output)
  expect(await realpath(before.output)).toBe(before.output)
})

it('refuses a transaction for another profile before resuming it', async () => {
  const { directory, dependencies, state, calls } = await fixture()
  dependencies.readTransaction = async () => ({ ...state, profile: '/another-profile' })
  await expect(continueLocalDelivery(directory, dependencies)).rejects.toThrow('profile')
  expect(calls).toEqual(['build', 'prepare'])
  expect(JSON.parse(await readFile(join(directory, 'delivery.json'), 'utf8')).phase).toBe(
    'prepared'
  )
})

it('does not report a delivery healthy after its installation was rolled back', async () => {
  const { directory, dependencies, state, calls } = await fixture()
  await continueLocalDelivery(directory, dependencies)
  calls.length = 0
  dependencies.readTransaction = async () => ({ ...state, phase: 'rolled-back' })
  await expect(continueLocalDelivery(directory, dependencies)).rejects.toThrow('rolled back')
  expect(calls).toEqual([])
})
