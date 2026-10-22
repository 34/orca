import { mkdtemp, open, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { classifyInstallDirectoryUse, inspectMacInstallUse } from './orca34-install-idle.mjs'

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
