import { execFileSync } from 'node:child_process'
import { readFileSync, realpathSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildDistributionManifest } from '../build-distribution.cjs'

const commitPattern = /^[a-f0-9]{40}$/

export function assertOrca34CandidateIdentity(manifest, plist, expectedCommit) {
  const distribution = buildDistributionManifest({ ORCA_BUILD_DISTRIBUTION: 'orca34' })
  if (
    !manifest ||
    Object.entries(distribution).some(([key, value]) => manifest.distribution?.[key] !== value) ||
    plist?.CFBundleIdentifier !== distribution.appId ||
    plist.CFBundleExecutable !== distribution.appName
  ) {
    throw new Error('Candidate is not an isolated Orca 34 application')
  }
  if (
    typeof manifest.version !== 'string' ||
    !manifest.version.endsWith('.orca34') ||
    plist.CFBundleShortVersionString !== manifest.version ||
    plist.CFBundleVersion !== manifest.version
  ) {
    throw new Error('Candidate version does not match its bundle')
  }
  if (
    !commitPattern.test(manifest.commit ?? '') ||
    !commitPattern.test(expectedCommit ?? '') ||
    manifest.commit !== expectedCommit
  ) {
    throw new Error('Candidate source does not match the expected commit')
  }
  if (manifest.architecture !== 'arm64' || manifest.signing !== 'ad-hoc') {
    throw new Error('This installer currently accepts macOS arm64 ad hoc candidates only')
  }
  if (
    !commitPattern.test(manifest.upstreamBaseline ?? '') ||
    !Number.isFinite(Date.parse(manifest.builtAt))
  ) {
    throw new Error('Candidate provenance is incomplete')
  }
  return manifest
}

export function verifyOrca34InstallCandidate(
  appPath,
  expectedCommit,
  { platform = process.platform, architecture = process.arch, run = execFileSync } = {}
) {
  if (platform !== 'darwin' || architecture !== 'arm64') {
    throw new Error('Orca 34 local installation currently requires macOS arm64')
  }
  const candidate = realpathSync(appPath)
  if (!candidate.endsWith('.app') || !statSync(candidate).isDirectory()) {
    throw new Error('Candidate must be an existing application bundle')
  }
  const options = { encoding: 'utf8', timeout: 120_000, maxBuffer: 1024 * 1024 }
  // Verify before trusting the manifest; ad hoc integrity is not publisher authentication.
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', candidate], options)
  const plist = JSON.parse(
    run(
      '/usr/bin/plutil',
      ['-convert', 'json', '-o', '-', join(candidate, 'Contents', 'Info.plist')],
      options
    )
  )
  const manifest = assertOrca34CandidateIdentity(
    JSON.parse(readFileSync(join(candidate, 'Contents', 'Resources', 'orca34-build.json'), 'utf8')),
    plist,
    expectedCommit
  )
  const executable = join(candidate, 'Contents', 'MacOS', plist.CFBundleExecutable)
  if (run('/usr/bin/lipo', ['-archs', executable], options).trim() !== 'arm64') {
    throw new Error('Candidate executable architecture differs from its manifest')
  }
  return { candidate, manifest }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [candidate, commit, ...extra] = process.argv.slice(2)
  if (!candidate || !commit || extra.length) {
    throw new Error(
      'Usage: node config/scripts/verify-orca34-install-candidate.mjs <app-path> <expected-source-sha>'
    )
  }
  process.stdout.write(
    `${JSON.stringify(verifyOrca34InstallCandidate(candidate, commit), null, 2)}\n`
  )
}
