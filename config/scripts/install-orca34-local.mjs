import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { tsImport } from 'tsx/esm/api'
import { verifyOrca34InstallCandidate } from './verify-orca34-install-candidate.mjs'
import { assertMacInstallStopped } from './orca34-install-idle.mjs'
import { rollbackInstallWithProfile } from './orca34-install-profile-rollback.mjs'
import { checkLocalInstallHealth } from './orca34-install-health.mjs'
import {
  prepareInstallTransaction,
  publishInstallTransaction,
  readInstallTransaction,
  rollbackUnstartedInstall
} from './orca34-install-transaction.mjs'

export function parseLocalInstallArguments(args) {
  const [command, ...values] = args
  if (['prepare', 'install'].includes(command) && values.length === 4) {
    const [candidate, commit, target, profile] = values
    if (!/^[a-f0-9]{40}$/.test(commit)) {
      throw new Error('Expected the full candidate source commit')
    }
    return {
      command,
      candidate: resolve(candidate),
      commit,
      target: resolve(target),
      profile: resolve(profile)
    }
  }
  if (
    ['resume', 'rollback-unstarted', 'rollback-with-profile', 'health', 'status'].includes(
      command
    ) &&
    values.length === 1
  ) {
    return { command, directory: resolve(values[0]) }
  }
  throw new Error(
    'Usage: prepare|install <candidate.app> <source-sha> <installed.app> <user-data> OR resume|rollback-unstarted|rollback-with-profile|health|status <transaction-directory>'
  )
}

export async function runLocalInstall(args) {
  const request = parseLocalInstallArguments(args)
  if (request.command === 'status') {
    return readInstallTransaction(request.directory)
  }
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    throw new Error('Local Orca 34 installation requires macOS arm64')
  }
  if (request.command === 'health') {
    return checkLocalInstallHealth(request.directory)
  }
  const existing = request.directory ? await readInstallTransaction(request.directory) : request
  const { acquireOrca34UpgradeLease } = await tsImport(
    '../../src/main/startup/orca34-install-access.ts',
    import.meta.url
  )
  const lease = acquireOrca34UpgradeLease(
    existing.target,
    existing.profile,
    undefined,
    request.command === 'rollback-with-profile' ? existing.directory : undefined
  )
  try {
    const guards = {
      assertStopped: async (state) => {
        lease.assertActive()
        await assertMacInstallStopped(state)
        lease.assertActive()
      },
      verifyCandidate: verifyOrca34InstallCandidate,
      protectRestore: (state) => lease.protectRestore(state.directory),
      finishRestore: (state) => lease.finishRestore(state.directory)
    }
    if (request.command === 'rollback-with-profile') {
      return await rollbackInstallWithProfile(request.directory, guards)
    }
    if (request.command === 'rollback-unstarted') {
      return await rollbackUnstartedInstall(request.directory, guards)
    }
    let state = existing
    if (!request.directory) {
      const old = JSON.parse(
        await readFile(join(existing.target, 'Contents', 'Resources', 'orca34-build.json'), 'utf8')
      )
      verifyOrca34InstallCandidate(existing.target, old.commit)
      state = await prepareInstallTransaction(request, guards)
    }
    if (request.command === 'prepare') {
      return state
    }
    const installed = await publishInstallTransaction(state.directory, guards)
    verifyOrca34InstallCandidate(installed.target, installed.commit)
    return { ...installed, health: 'not-yet-checked' }
  } finally {
    lease.release()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runLocalInstall(process.argv.slice(2)).then(
    (result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`),
    (error) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    }
  )
}
