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
    ORCA_COMPUTER_MACOS_SIGN_IDENTITY: '-'
  }
  assertOrca34MacPackage({ electronPlatformName: 'darwin', arch: 3 }, result)
  return result
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    throw new Error('Build the first Orca 34 candidate on macOS arm64')
  }
  if (execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()) {
    throw new Error('Commit source changes before building a traceable Orca 34 candidate')
  }
  const identity = getLocalBuildIdentity()
  identity.commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const env = orca34MacBuildEnvironment(identity)
  const pnpm = resolvePnpmCliInvocation()
  for (const script of ['build:desktop', 'build:native', 'ensure:electron-runtime']) {
    execFileSync(pnpm.command, [...pnpm.prefixArgs, 'run', script], { env, stdio: 'inherit' })
  }
  execFileSync(
    pnpm.command,
    [
      ...pnpm.prefixArgs,
      'exec',
      'electron-builder',
      '--config',
      'config/electron-builder.orca34.cjs',
      '--mac',
      '--arm64',
      '--publish',
      'never'
    ],
    { env, stdio: 'inherit' }
  )
}
