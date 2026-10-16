import { createRequire } from 'node:module'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
const require = createRequire(import.meta.url)
const {
  buildDistributionDefine,
  buildDistributionManifest,
  assertBuildDistributionMatches
} = require('../build-distribution.cjs')

it('only accepts the explicit fork build switch and otherwise retains official identity', () => {
  expect(buildDistributionDefine({})).toBe('null')
  expect(buildDistributionManifest({})).toMatchObject({
    appName: 'Orca',
    appId: 'com.stablyai.orca'
  })
  expect(buildDistributionDefine({ ORCA_BUILD_DISTRIBUTION: 'orca34' })).toBe('"orca34"')
  expect(() => buildDistributionDefine({ ORCA_BUILD_DISTRIBUTION: 'typo' })).toThrow('Unsupported')
})

it('rejects mixing a fork main bundle with official packaging or missing build evidence', () => {
  const root = mkdtempSync(join(tmpdir(), 'orca-distribution-'))
  try {
    expect(() => assertBuildDistributionMatches(root, 'com.stablyai.orca', 'Orca')).not.toThrow()
    expect(() => assertBuildDistributionMatches(root, 'com.orca34.desktop', 'Orca 34')).toThrow(
      'rebuild main'
    )
    writeFileSync(
      join(root, 'orca-build-distribution.json'),
      JSON.stringify(buildDistributionManifest({ ORCA_BUILD_DISTRIBUTION: 'orca34' }))
    )
    expect(() => assertBuildDistributionMatches(root, 'com.stablyai.orca', 'Orca')).toThrow(
      'rebuild main'
    )
    expect(() => assertBuildDistributionMatches(root, 'com.orca34.desktop', 'Orca')).toThrow(
      'rebuild main'
    )
    expect(() =>
      assertBuildDistributionMatches(root, 'com.orca34.desktop', 'Orca 34')
    ).not.toThrow()
    writeFileSync(
      join(root, 'orca-build-distribution.json'),
      JSON.stringify(buildDistributionManifest({}))
    )
    expect(() => assertBuildDistributionMatches(root, 'com.orca34.desktop', 'Orca 34')).toThrow(
      'rebuild main'
    )
    expect(() => assertBuildDistributionMatches(root, 'com.stablyai.orca', 'Orca')).not.toThrow()
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
