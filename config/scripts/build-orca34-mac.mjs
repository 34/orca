import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { getLocalBuildIdentity } from './build-mac-local.mjs'
import { resolvePnpmCliInvocation } from './pnpm-cli-invocation.mjs'
import { assertOrca34MacPackage } from './orca34-mac-package.cjs'

export function orca34MacBuildEnvironment(identity, env = process.env) {
  const result = {
    ...env,
    ORCA_BUILD_DISTRIBUTION: 'orca34',
    ORCA_BUILD_COMMIT: identity.commit,
    ORCA_LOCAL_BUILD_VERSION: `${identity.version}.orca34`,
    ORCA_BACKGROUND_LAUNCH: '1',
    ORCA_SKIP_DEV_CLI_INSTALL: '1',
    CSC_NAME: '-',
    CSC_IDENTITY_AUTO_DISCOVERY: 'false',
    ORCA_COMPUTER_MACOS_SIGN_IDENTITY: '-',
    ORCA_COMPUTER_MACOS_BUNDLE_ID: 'com.orca34.desktop.computer-use'
  }
  assertOrca34MacPackage({ electronPlatformName: 'darwin', arch: 3 }, result)
  return result
}

export function buildOrca34MacCandidate({ output, expectedCommit } = {}) {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    throw new Error('Build the first Orca 34 candidate on macOS arm64')
  }
  if (execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()) {
    throw new Error('Commit source changes before building a traceable Orca 34 candidate')
  }
  const identity = getLocalBuildIdentity()
  identity.commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  if (expectedCommit && identity.commit !== expectedCommit) {
    throw new Error('Source commit changed since delivery preparation')
  }
  const env = orca34MacBuildEnvironment(identity)
  const pnpm = resolvePnpmCliInvocation()
  const builds = [
    ['build:desktop'],
    ['build:computer-macos', '--single-arch'],
    ['build:keyboard-layout-macos', '--single-arch'],
    ['build:notification-status-macos', '--single-arch', '--bundle-id', 'com.orca34.desktop'],
    ['ensure:electron-runtime']
  ]
  for (const args of builds) {
    execFileSync(pnpm.command, [...pnpm.prefixArgs, 'run', ...args], { env, stdio: 'inherit' })
  }
  execFileSync(
    pnpm.command,
    [
      ...pnpm.prefixArgs,
      'exec',
      'electron-builder',
      '--config',
      'config/electron-builder.orca34.cjs',
      ...(output ? [`--config.directories.output=${output}`] : []),
      '--mac',
      '--arm64',
      '--publish',
      'never'
    ],
    { env, stdio: 'inherit' }
  )
  return {
    commit: identity.commit,
    candidate: resolve(output ?? 'dist/orca34', 'mac-arm64', 'Orca 34.app')
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  buildOrca34MacCandidate()
}
