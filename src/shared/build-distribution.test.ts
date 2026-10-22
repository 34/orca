import { afterEach, expect, it, vi } from 'vitest'
import { getBuildDistribution } from './build-distribution'
import {
  getDevInstanceIdentity,
  shouldApplyPreReadyAppName
} from '../main/startup/dev-instance-identity'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.resetModules()
})

it('keeps official defaults even with a fork runtime environment variable', () => {
  vi.stubEnv('ORCA_BUILD_DISTRIBUTION', 'orca34')
  expect(getBuildDistribution()).toMatchObject({ appName: 'Orca', appId: 'com.stablyai.orca' })
})

it('selects fork names without changing packaged Keychain initialization timing', () => {
  vi.stubGlobal('ORCA_BUILD_DISTRIBUTION', 'orca34')
  const packaged = getDevInstanceIdentity(false, {})
  expect(packaged).toMatchObject({ appName: 'Orca 34', appUserModelId: 'com.orca34.desktop' })
  expect(shouldApplyPreReadyAppName(packaged)).toBe(false)
  expect(getDevInstanceIdentity(true, { ORCA_DEV_REPO_ROOT: '/fixture' })).toMatchObject({
    appName: 'Orca 34 Dev',
    appUserModelId: expect.stringMatching(/^com\.orca34\.desktop\.dev\./)
  })
})

it('keeps fork daemon jobs and compatibility identity separate without changing protocol', async () => {
  vi.stubGlobal('ORCA_BUILD_DISTRIBUTION', 'orca34')
  vi.resetModules()
  const { LOCAL_BUILD_COMPATIBILITY_CONTRACT: contract } =
    await import('./local-build-compatibility-contract')
  const { macDaemonJobLabel } = await import('../main/daemon/macos-daemon-job-label')
  const { default: official } = await import('./local-build-compatibility-contract.json')
  expect(contract).toEqual({ ...official, appId: 'com.orca34.desktop' })
  expect(macDaemonJobLabel('/fixture/profile')).toMatch(
    /^com\.orca34\.desktop\.terminal\.[a-f0-9]+\.v\d+$/
  )
  expect(macDaemonJobLabel('/fixture/profile')).not.toBe(macDaemonJobLabel('/fixture/other'))
})
