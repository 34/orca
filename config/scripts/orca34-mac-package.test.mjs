import { expect, it } from 'vitest'
import { assertOrca34MacPackage, computerUseInfoForOrca34 } from './orca34-mac-package.cjs'
import base from '../electron-builder.config.cjs'
import fork from '../electron-builder.orca34.cjs'
const env = {
  ORCA_BUILD_DISTRIBUTION: 'orca34',
  ORCA_BUILD_COMMIT: 'a'.repeat(40),
  ORCA_LOCAL_BUILD_VERSION: '1.4.300-local.1.test',
  CSC_NAME: '-',
  CSC_IDENTITY_AUTO_DISCOVERY: 'false'
}
it('keeps inherited packaging safeguards while separating application identity and output', () => {
  expect(fork.appId).toBe('com.orca34.desktop')
  expect(fork.productName).toBe('Orca 34')
  expect(fork.protocols).toEqual([{ name: 'Orca 34', schemes: ['orca34'] }])
  expect(fork.publish).toBeNull()
  expect(fork.mac.executableName).toBe('Orca 34')
  expect(fork.mac.signIgnore).toEqual(base.mac.signIgnore)
  expect(fork.mac.entitlements).toBe(base.mac.entitlements)
  expect(fork.mac.extraResources).toEqual(base.mac.extraResources)
  expect(fork.files).toContain('!.context{,/**/*}')
  expect(fork.files).toContain('!out/bin{,/**/*}')
  expect(fork.directories.output).toBe('dist/orca34')
  expect(base.appId).toBe('com.stablyai.orca')
  expect(base.protocols).toEqual([{ name: 'Orca', schemes: ['orca'] }])
})
it('refuses unsupported platforms, release flags and implicit signing', () => {
  const context = { electronPlatformName: 'darwin', arch: 3 }
  expect(() => assertOrca34MacPackage(context, env)).not.toThrow()
  expect(() => assertOrca34MacPackage({ ...context, arch: 1 }, env)).toThrow('arm64')
  expect(() => assertOrca34MacPackage({ ...context, electronPlatformName: 'win32' }, env)).toThrow(
    'arm64'
  )
  for (const overrides of [
    { ORCA_MAC_RELEASE: '1' },
    { ORCA_BUILD_IDENTITY: 'stable' },
    { CSC_NAME: 'Developer ID' },
    { ORCA_COMPUTER_MACOS_SIGN_IDENTITY: 'Developer ID' },
    { ORCA_LOCAL_BUILD_VERSION: '' }
  ]) {
    expect(() => assertOrca34MacPackage(context, { ...env, ...overrides })).toThrow()
  }
})
it('changes helper identity without discarding its executable, permissions or version', () => {
  const original = {
    CFBundleIdentifier: 'com.stablyai.orca.computer-use',
    CFBundleExecutable: 'orca-computer-use-macos',
    CFBundleVersion: '1',
    NSCameraUsageDescription: 'camera'
  }
  expect(computerUseInfoForOrca34(original)).toEqual({
    ...original,
    CFBundleIdentifier: 'com.orca34.desktop.computer-use',
    CFBundleName: 'Orca 34 Computer Use',
    CFBundleDisplayName: 'Orca 34 Computer Use'
  })
  expect(original.CFBundleIdentifier).toBe('com.stablyai.orca.computer-use')
  expect(() => computerUseInfoForOrca34({ CFBundleIdentifier: 'other.app' })).toThrow()
})

it('builds in the background without installing a global CLI or enabling official release identity', async () => {
  const { orca34MacBuildEnvironment } = await import('./build-orca34-mac.mjs')
  const identity = { commit: 'a'.repeat(40), version: '1.4.300-local.1.aaaa' }
  expect(orca34MacBuildEnvironment(identity, {})).toMatchObject({
    ORCA_BUILD_DISTRIBUTION: 'orca34',
    ORCA_BACKGROUND_LAUNCH: '1',
    ORCA_SKIP_DEV_CLI_INSTALL: '1',
    CSC_NAME: '-',
    ORCA_LOCAL_BUILD_VERSION: '1.4.300-local.1.aaaa.orca34'
  })
  expect(() => orca34MacBuildEnvironment(identity, { ORCA_MAC_RELEASE: '1' })).toThrow(
    'Official release'
  )
})
