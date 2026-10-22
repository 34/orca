import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  realpath,
  rename,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import {
  classifyInstallDirectoryUse,
  inspectMacInstallUse,
  removeStoppedInstallSockets
} from './orca34-install-idle.mjs'

const empty = { code: 1, stdout: '', stderr: '', timedOut: false, outputTruncated: false }
it('accepts only a complete empty lsof scan and keeps live processes even on exit 1', () => {
  expect(classifyInstallDirectoryUse(empty)).toBe('exited')
  expect(classifyInstallDirectoryUse({ ...empty, stdout: 'p123\n' })).toBe('live')
  for (const change of [
    { code: 0 },
    { code: null },
    { stderr: 'permission denied' },
    { timedOut: true },
    { outputTruncated: true },
    { stdout: 'unexpected output' }
  ]) {
    expect(classifyInstallDirectoryUse({ ...empty, ...change })).toBe('unverifiable')
  }
})

it('does not treat command failure or missing paths as proof that writers stopped', async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'orca34-idle-')))
  try {
    const commands = []
    const options = {
      platform: 'darwin',
      run: async (request) => {
        commands.push(request)
        return empty
      }
    }
    expect(await inspectMacInstallUse([directory], options)).toEqual([
      { path: directory, verdict: 'exited' }
    ])
    expect(commands[0].args).toEqual(['-F', 'p', '+D', directory])
    const failed = {
      ...options,
      run: async () => {
        throw new Error('unavailable')
      }
    }
    expect(await inspectMacInstallUse([directory], failed)).toEqual([
      { path: directory, verdict: 'unverifiable' }
    ])
    const missing = join(directory, 'missing')
    expect(await inspectMacInstallUse([missing], options)).toEqual([
      { path: missing, verdict: 'unverifiable' }
    ])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

it.skipIf(process.platform !== 'darwin')(
  'detects a real open file and then observes its closure',
  async () => {
    const directory = await realpath(await mkdtemp(join(tmpdir(), 'orca34-idle-real-')))
    const handle = await open(join(directory, 'writer'), 'w')
    try {
      expect((await inspectMacInstallUse([directory]))[0].verdict).toBe('live')
    } finally {
      await handle.close()
    }
    try {
      expect((await inspectMacInstallUse([directory]))[0].verdict).toBe('exited')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
)

it.skipIf(process.platform !== 'darwin')(
  'removes only stopped Orca socket endpoints before a snapshot',
  async () => {
    const root = await realpath(await mkdtemp('/tmp/o34-idle-'))
    const state = { target: join(root, 'app'), profile: join(root, 'profile') }
    await mkdir(state.target)
    await mkdir(join(state.profile, 'daemon'), { recursive: true })
    const stale = async (path) => {
      const server = createServer()
      const temporary = join(root, 'socket')
      await new Promise((resolve) => server.listen(temporary, resolve))
      await rename(temporary, path)
      await new Promise((resolve) => server.close(resolve))
    }
    try {
      const daemon = join(state.profile, 'daemon', 'daemon-v48.sock')
      const runtime = join(state.profile, 'o-99999999-rt.sock')
      const unknown = join(state.profile, 'user.sock')
      for (const path of [daemon, runtime, unknown]) {
        await stale(path)
      }
      const regular = join(state.profile, 'daemon', 'daemon-v49.sock')
      const link = join(state.profile, 'daemon', 'daemon-v50.sock')
      await writeFile(regular, 'keep')
      await symlink('daemon-v49.sock', link)
      await expect(
        removeStoppedInstallSockets(state, () => {
          throw new Error('lease lost')
        })
      ).rejects.toThrow('lease lost')
      expect((await lstat(daemon)).isSocket()).toBe(true)
      await removeStoppedInstallSockets(state, () => {})
      for (const path of [daemon, runtime]) {
        await expect(lstat(path)).rejects.toThrow()
      }
      expect((await lstat(unknown)).isSocket()).toBe(true)
      expect((await lstat(link)).isSymbolicLink()).toBe(true)
      expect(await readFile(regular, 'utf8')).toBe('keep')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }
)

it.skipIf(process.platform !== 'darwin')(
  'refuses socket cleanup while its owner is live',
  async () => {
    const root = await realpath(await mkdtemp('/tmp/o34-idle-'))
    const state = { target: join(root, 'app'), profile: join(root, 'profile') }
    await mkdir(state.target)
    await mkdir(join(state.profile, 'daemon'), { recursive: true })
    const path = join(state.profile, 'daemon', 'daemon-v48.sock')
    const server = createServer()
    await new Promise((resolve) => server.listen(path, resolve))
    try {
      await expect(removeStoppedInstallSockets(state, () => {})).rejects.toThrow('live')
      expect((await lstat(path)).isSocket()).toBe(true)
    } finally {
      await new Promise((resolve) => server.close(resolve))
      await rm(root, { recursive: true, force: true })
    }
  }
)
