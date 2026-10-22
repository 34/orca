const { execFileSync } = require('node:child_process')
const { readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { orca34 } = require('../../src/shared/build-distributions.json')

function assertOrca34MacPackage(context, env = process.env) {
  if (context.electronPlatformName !== 'darwin' || context.arch !== 3) {
    throw new Error('Orca 34 candidates currently support macOS arm64 only')
  }
  if (
    env.ORCA_BUILD_DISTRIBUTION !== 'orca34' ||
    !env.ORCA_LOCAL_BUILD_VERSION ||
    !/^[a-f0-9]{40}$/.test(env.ORCA_BUILD_COMMIT ?? '')
  ) {
    throw new Error('Build Orca 34 with its compiled distribution and explicit local version')
  }
  if (
    [
      'ORCA_MAC_RELEASE',
      'ORCA_MAC_HOURLY',
      'ORCA_MAC_DAILY',
      'ORCA_MAC_ADHOC',
      'ORCA_WIN_HOURLY',
      'ORCA_WIN_DAILY',
      'ORCA_WIN_ADHOC'
    ].some((key) => env[key] === '1') ||
    env.ORCA_BUILD_IDENTITY
  ) {
    throw new Error('Official release identity flags cannot be used for Orca 34 candidates')
  }
  if (
    env.CSC_NAME !== '-' ||
    env.CSC_IDENTITY_AUTO_DISCOVERY !== 'false' ||
    (env.ORCA_COMPUTER_MACOS_SIGN_IDENTITY && env.ORCA_COMPUTER_MACOS_SIGN_IDENTITY !== '-')
  ) {
    throw new Error('Orca 34 local candidates require explicit ad hoc signing')
  }
}

function computerUseInfoForOrca34(info) {
  if (
    !['com.stablyai.orca.computer-use', `${orca34.appId}.computer-use`].includes(
      info.CFBundleIdentifier
    )
  ) {
    throw new Error('Unexpected Computer Use helper identity')
  }
  return {
    ...info,
    CFBundleIdentifier: `${orca34.appId}.computer-use`,
    CFBundleName: `${orca34.appName} Computer Use`,
    CFBundleDisplayName: `${orca34.appName} Computer Use`
  }
}

function prepareOrca34MacHelper(context, run = execFileSync) {
  const appPath = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  const plist = join(
    appPath,
    'Contents',
    'Resources',
    'Orca Computer Use.app',
    'Contents',
    'Info.plist'
  )
  const info = JSON.parse(
    run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', plist], { encoding: 'utf8' })
  )
  writeFileSync(plist, JSON.stringify(computerUseInfoForOrca34(info)))
  run('/usr/bin/plutil', ['-convert', 'xml1', plist])
}

function writeOrca34BuildManifest(context) {
  const resources = join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
    'Contents',
    'Resources'
  )
  const source = JSON.parse(
    readFileSync(join(__dirname, '..', '..', 'out', 'main', 'orca-build-distribution.json'), 'utf8')
  )
  writeFileSync(
    join(resources, 'orca34-build.json'),
    JSON.stringify(
      {
        distribution: source,
        upstreamBaseline: '49109f362f057cd2dc3d81cd378cb84d140c3dc5',
        upstreamTag: 'v1.4.232',
        commit: process.env.ORCA_BUILD_COMMIT,
        version: context.packager.appInfo.version,
        architecture: 'arm64',
        signing: 'ad-hoc',
        builtAt: new Date().toISOString()
      },
      null,
      2
    )
  )
}
module.exports = {
  assertOrca34MacPackage,
  computerUseInfoForOrca34,
  prepareOrca34MacHelper,
  writeOrca34BuildManifest
}
