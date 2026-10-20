import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { buildDistributionManifest } from '../build-distribution.cjs'
import {
  assertOrca34CandidateIdentity,
  verifyOrca34InstallCandidate
} from './verify-orca34-install-candidate.mjs'

const commit = 'a'.repeat(40)
const manifest = {
  distribution: buildDistributionManifest({ ORCA_BUILD_DISTRIBUTION: 'orca34' }),
  commit,
  upstreamBaseline: 'b'.repeat(40),
  version: '1.4.232-local.1.aaaaaaaaaaaa.orca34',
  architecture: 'arm64',
  signing: 'ad-hoc',
  builtAt: '2026-10-20T00:00:00.000Z'
}
const plist = {
  CFBundleIdentifier: 'com.orca34.desktop',
  CFBundleExecutable: 'Orca 34',
  CFBundleShortVersionString: manifest.version,
  CFBundleVersion: manifest.version
}
const roots = []
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

it('requires matching isolated identity, version, source and supported platform metadata', () => {
  expect(assertOrca34CandidateIdentity(manifest, plist, commit)).toBe(manifest)
  for (const changed of [
    { distribution: { ...manifest.distribution, userDataDirectory: 'orca' } },
    { distribution: { ...manifest.distribution, automaticUpdates: true } },
    { commit: 'c'.repeat(40) },
    { version: '1.4.232' },
    { architecture: 'x64' },
    { signing: 'developer-id' },
    { upstreamBaseline: '' },
    { builtAt: 'invalid' }
  ]) {
    expect(() =>
      assertOrca34CandidateIdentity({ ...manifest, ...changed }, plist, commit)
    ).toThrow()
  }
  expect(() =>
    assertOrca34CandidateIdentity(
      manifest,
      { ...plist, CFBundleIdentifier: 'com.stablyai.orca' },
      commit
    )
  ).toThrow()
  expect(() => assertOrca34CandidateIdentity(manifest, plist, undefined)).toThrow()
})

it('checks signed bundle integrity before metadata and refuses a mismatched executable architecture', () => {
  const root = mkdtempSync(join(tmpdir(), 'orca34-candidate-'))
  roots.push(root)
  const app = join(root, 'Orca 34.app')
  const resources = join(app, 'Contents', 'Resources')
  mkdirSync(resources, { recursive: true })
  writeFileSync(join(resources, 'orca34-build.json'), JSON.stringify(manifest))
  const commands = []
  const run = (command, args) => {
    commands.push([command, args])
    if (command.endsWith('plutil')) {
      return JSON.stringify(plist)
    }
    if (command.endsWith('lipo')) {
      return 'arm64\n'
    }
    return ''
  }
  const options = { platform: 'darwin', architecture: 'arm64', run }
  expect(verifyOrca34InstallCandidate(app, commit, options).manifest.commit).toBe(commit)
  expect(commands[0]).toEqual([
    '/usr/bin/codesign',
    ['--verify', '--deep', '--strict', realpathSync(app)]
  ])
  expect(() =>
    verifyOrca34InstallCandidate(app, commit, {
      ...options,
      run: (command, args) => (command.endsWith('lipo') ? 'x86_64\n' : run(command, args))
    })
  ).toThrow('architecture')
  expect(() =>
    verifyOrca34InstallCandidate(app, commit, {
      ...options,
      run: () => {
        throw new Error('signature failed')
      }
    })
  ).toThrow('signature failed')
  expect(() =>
    verifyOrca34InstallCandidate(app, commit, {
      ...options,
      platform: 'win32'
    })
  ).toThrow('macOS arm64')
})
