const { existsSync, readFileSync } = require('node:fs')
const { join } = require('node:path')
const distributions = require('../src/shared/build-distributions.json')

function buildDistributionDefine(env = process.env) {
  const value = env.ORCA_BUILD_DISTRIBUTION
  if (value !== undefined && value !== '' && value !== 'orca34') {
    throw new Error(`Unsupported build distribution: ${value}`)
  }
  return value === 'orca34' ? JSON.stringify(value) : 'null'
}

function buildDistributionManifest(env = process.env) {
  return buildDistributionDefine(env) === 'null' ? distributions.official : distributions.orca34
}

function assertBuildDistributionMatches(mainDirectory, appId, appName) {
  const manifestPath = join(mainDirectory, 'orca-build-distribution.json')
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null
  if (appId !== distributions.orca34.appId && manifest?.appId !== distributions.orca34.appId) {
    return
  }
  if (!manifest || manifest.appId !== appId || manifest.appName !== appName) {
    throw new Error(
      'Build distribution does not match package identity; rebuild main for this distribution'
    )
  }
}

module.exports = {
  buildDistributionDefine,
  buildDistributionManifest,
  assertBuildDistributionMatches
}
