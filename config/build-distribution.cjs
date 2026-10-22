const { createHash } = require('node:crypto')
const { existsSync, readFileSync, writeFileSync, mkdirSync } = require('node:fs')
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

function assertBuildDistributionMatches(mainDirectory, appId, appName, cliDirectory) {
  if (cliDirectory) {
    assertBuildDistributionMatches(cliDirectory, appId, appName)
    readCompiledCliDistribution(join(cliDirectory, '..'))
  }
  const manifestPath = join(mainDirectory, 'orca-build-distribution.json')
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null
  if (appId !== distributions.orca34.appId && manifest?.appId !== distributions.orca34.appId) {
    return
  }
  if (!manifest || manifest.appId !== appId || manifest.appName !== appName) {
    throw new Error(
      'Build distribution does not match package identity; rebuild main/CLI for this distribution'
    )
  }
}

function readCompiledCliDistribution(outDirectory) {
  const marker = join(outDirectory, 'cli', 'orca-build-distribution.json')
  if (!existsSync(marker)) {
    if (existsSync(join(outDirectory, 'shared', 'build-distribution.js'))) {
      throw new Error('Compiled CLI distribution marker missing; rebuild CLI')
    }
    return distributions.official
  }
  const manifest = JSON.parse(readFileSync(marker, 'utf8'))
  const distribution = Object.values(distributions).find((entry) => entry.appId === manifest.appId)
  if (
    !distribution ||
    Object.entries(distribution).some(([key, value]) => manifest[key] !== value)
  ) {
    throw new Error('Unknown compiled CLI distribution; rebuild CLI')
  }
  if (manifest.cliModuleSha256 !== cliModuleDigest(outDirectory)) {
    throw new Error('Compiled CLI identity module changed; rebuild CLI')
  }
  return distribution
}

function cliModuleDigest(outDirectory) {
  return createHash('sha256')
    .update(readFileSync(join(outDirectory, 'shared', 'build-distribution.js')))
    .update(readFileSync(join(outDirectory, 'shared', 'build-distributions.json')))
    .digest('hex')
}

function stampCliDistribution(outDirectory, env = process.env) {
  const literal = buildDistributionDefine(env)
  const modulePath = join(outDirectory, 'shared', 'build-distribution.js')
  if (!existsSync(modulePath)) {
    if (literal === 'null') {
      return
    }
    throw new Error('Compiled build-distribution module missing; rebuild CLI')
  }
  const source = readFileSync(modulePath, 'utf8').replace(
    /^const ORCA_BUILD_DISTRIBUTION = (?:null|"orca34");\r?\n/m,
    ''
  )
  if (!source.startsWith('"use strict";')) {
    throw new Error('Expected CommonJS build-distribution module')
  }
  writeFileSync(
    modulePath,
    source.replace('"use strict";', `"use strict";\nconst ORCA_BUILD_DISTRIBUTION = ${literal};`)
  )
  mkdirSync(join(outDirectory, 'cli'), { recursive: true })
  writeFileSync(
    join(outDirectory, 'cli', 'orca-build-distribution.json'),
    JSON.stringify({
      ...buildDistributionManifest(env),
      cliModuleSha256: cliModuleDigest(outDirectory)
    })
  )
}

module.exports = {
  stampCliDistribution,
  readCompiledCliDistribution,
  buildDistributionDefine,
  buildDistributionManifest,
  assertBuildDistributionMatches
}
