import { lstat, readdir, realpath, unlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { runProcess } from '@orca/process-host'
import { tsImport } from 'tsx/esm/api'

export function classifyInstallDirectoryUse(result) {
  if (result.stdout?.split('\n').some((line) => /^p[1-9]\d*$/.test(line))) {
    return 'live'
  }
  if (
    result.code === 1 &&
    result.stdout === '' &&
    result.stderr === '' &&
    !result.timedOut &&
    !result.outputTruncated
  ) {
    return 'exited'
  }
  return 'unverifiable'
}

// A point-in-time probe, not a lease: callers must also prevent new app launches.
export async function inspectMacInstallUse(
  paths,
  { platform = process.platform, run = runProcess } = {}
) {
  if (platform !== 'darwin') {
    throw new Error('Orca 34 installation use checks require macOS')
  }
  return Promise.all(
    paths.map(async (path) => {
      try {
        if ((await realpath(path)) !== resolve(path)) {
          return { path, verdict: 'unverifiable' }
        }
        const result = await run({
          program: '/usr/sbin/lsof',
          args: ['-F', 'p', '+D', path],
          timeoutMs: 10_000,
          maxOutputBytes: 8192
        })
        return { path, verdict: classifyInstallDirectoryUse(result) }
      } catch {
        return { path, verdict: 'unverifiable' }
      }
    })
  )
}

async function isPresent(path) {
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

export async function assertMacInstallStopped({ target, profile, directory }) {
  const paths = [profile]
  if (await isPresent(target)) {
    paths.push(target)
  }
  const previous = directory && join(directory, 'original.app')
  if (previous && (await isPresent(previous))) {
    paths.push(previous)
  }
  if (paths.length === 1) {
    throw new Error('Installation application location is unverifiable')
  }
  const results = await inspectMacInstallUse(paths)
  const blocked = results.filter((result) => result.verdict !== 'exited')
  if (blocked.length) {
    throw new Error(
      `Installation must wait: ${blocked.map(({ path, verdict }) => `${path}: ${verdict}`).join('; ')}`
    )
  }
}

export async function removeStoppedInstallSockets(state, assertActive) {
  assertActive()
  await assertMacInstallStopped(state)
  const { RUNTIME_SOCKET_NAME_REGEX } = await tsImport(
    '../../src/main/runtime/runtime-rpc/runtime-rpc-socket-metadata.ts',
    import.meta.url
  )
  for (const [directory, pattern] of [
    [state.profile, RUNTIME_SOCKET_NAME_REGEX],
    [join(state.profile, 'daemon'), /^daemon-v\d+\.sock$/]
  ]) {
    if (!(await isPresent(directory))) {
      continue
    }
    if ((await realpath(directory)) !== directory || !(await lstat(directory)).isDirectory()) {
      throw new Error('Installation runtime directory must be a canonical directory')
    }
    for (const name of await readdir(directory)) {
      if (!pattern.test(name)) {
        continue
      }
      const path = join(directory, name)
      // Only dead runtime endpoints are disposable; same-named files and links are user data.
      if ((await lstat(path)).isSocket()) {
        assertActive()
        await unlink(path)
      }
    }
  }
  assertActive()
}
