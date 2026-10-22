import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it } from 'vitest'
import {
  stampCliDistribution,
  readCompiledCliDistribution,
  buildDistributionManifest,
  assertBuildDistributionMatches
} from '../build-distribution.cjs'
import { prepareDevCliTerminalWrappers } from './dev-cli-terminal-wrapper.mjs'
const roots = []
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'orca-cli-identity-'))
  roots.push(root)
  const out = join(root, 'out')
  mkdirSync(join(out, 'shared'), { recursive: true })
  writeFileSync(join(out, 'package.json'), '{"type":"commonjs"}')
  writeFileSync(join(out, 'shared', 'build-distributions.json'), '{}')
  writeFileSync(
    join(out, 'shared', 'build-distribution.js'),
    '"use strict";\nexports.identity = () => typeof ORCA_BUILD_DISTRIBUTION === "undefined" ? null : ORCA_BUILD_DISTRIBUTION;\n'
  )
  return { root, out }
}
it('pins the compiled identity despite inherited runtime environment and supports repeat preparation', () => {
  const { out } = fixture()
  const env = { ORCA_BUILD_DISTRIBUTION: 'orca34' }
  stampCliDistribution(out, env)
  stampCliDistribution(out, env)
  const modulePath = join(out, 'shared', 'build-distribution.js')
  const run = () =>
    execFileSync(
      process.execPath,
      ['-e', 'console.log(require(process.argv[1]).identity())', modulePath],
      { encoding: 'utf8', env: { ...process.env, ORCA_BUILD_DISTRIBUTION: 'orca34' } }
    ).trim()
  expect(run()).toBe('orca34')
  expect(readCompiledCliDistribution(out).userDataDirectory).toBe('orca34')
  stampCliDistribution(out, {})
  expect(run()).toBe('null')
  expect(readCompiledCliDistribution(out).userDataDirectory).toBe('orca')
})
it('requires matching CLI evidence for fork packaging and rejects reverse mixing', () => {
  const { out } = fixture()
  const main = join(out, 'main')
  const cli = join(out, 'cli')
  mkdirSync(main)
  writeFileSync(
    join(main, 'orca-build-distribution.json'),
    JSON.stringify(buildDistributionManifest({ ORCA_BUILD_DISTRIBUTION: 'orca34' }))
  )
  expect(() => assertBuildDistributionMatches(main, 'com.orca34.desktop', 'Orca 34', cli)).toThrow()
  stampCliDistribution(out, { ORCA_BUILD_DISTRIBUTION: 'orca34' })
  expect(() =>
    assertBuildDistributionMatches(main, 'com.orca34.desktop', 'Orca 34', cli)
  ).not.toThrow()
  writeFileSync(
    join(main, 'orca-build-distribution.json'),
    JSON.stringify(buildDistributionManifest({}))
  )
  expect(() => assertBuildDistributionMatches(main, 'com.stablyai.orca', 'Orca', cli)).toThrow()
  stampCliDistribution(out, {})
  expect(() => assertBuildDistributionMatches(main, 'com.stablyai.orca', 'Orca', cli)).not.toThrow()
})
it('uses fork dev command names while preserving only the profile-local orca alias', () => {
  const { root, out } = fixture()
  stampCliDistribution(out, { ORCA_BUILD_DISTRIBUTION: 'orca34' })
  for (const platform of ['darwin', 'win32']) {
    const userDataPath = join(root, platform)
    prepareDevCliTerminalWrappers({
      repoRoot: root,
      userDataPath,
      electronExecutable: '/fixture/electron',
      platform
    })
    const suffix = platform === 'win32' ? '.cmd' : ''
    expect(readFileSync(join(userDataPath, 'cli', 'bin', `orca34-dev${suffix}`), 'utf8')).toContain(
      userDataPath
    )
    expect(readFileSync(join(userDataPath, 'cli', 'bin', `orca${suffix}`), 'utf8')).toContain(
      userDataPath
    )
  }
})

it('refuses missing or stale markers for identity-aware compiled output', () => {
  const { out } = fixture()
  expect(() => readCompiledCliDistribution(out)).toThrow('marker missing')
  stampCliDistribution(out, { ORCA_BUILD_DISTRIBUTION: 'orca34' })
  const marker = join(out, 'cli', 'orca-build-distribution.json')
  const stale = JSON.parse(readFileSync(marker, 'utf8'))
  stale.devUserDataDirectory = 'orca-dev'
  writeFileSync(marker, JSON.stringify(stale))
  expect(() => readCompiledCliDistribution(out)).toThrow('rebuild CLI')
})

it('refuses a fork stamp on an older artifact without its identity module', () => {
  const { out } = fixture()
  rmSync(join(out, 'shared', 'build-distribution.js'))
  expect(() => stampCliDistribution(out, { ORCA_BUILD_DISTRIBUTION: 'orca34' })).toThrow(
    'module missing'
  )
  expect(() => stampCliDistribution(out, {})).not.toThrow()
  expect(readCompiledCliDistribution(out).appId).toBe('com.stablyai.orca')
})

it('rejects a CLI recompiled without preparation even if its old marker survives', () => {
  const { out } = fixture()
  stampCliDistribution(out, { ORCA_BUILD_DISTRIBUTION: 'orca34' })
  writeFileSync(
    join(out, 'shared', 'build-distribution.js'),
    '"use strict";\nexports.identity = () => null;\n'
  )
  expect(() => readCompiledCliDistribution(out)).toThrow('module changed')
  expect(() =>
    assertBuildDistributionMatches(
      join(out, 'main'),
      'com.orca34.desktop',
      'Orca 34',
      join(out, 'cli')
    )
  ).toThrow('module changed')
})
