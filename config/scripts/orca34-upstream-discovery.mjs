import assert from 'node:assert/strict'
import { runProcess } from '@orca/process-host'
import { parseDesktopStableTag } from './latest-stable-release.mjs'

export const ORCA_OFFICIAL_REPOSITORY = 'stablyai/orca'

function stableTag(tag) {
  const parsed = parseDesktopStableTag(tag)
  assert(
    parsed &&
      [parsed.major, parsed.minor, parsed.patch].every(Number.isSafeInteger) &&
      tag === `v${parsed.major}.${parsed.minor}.${parsed.patch}`,
    'Expected an official desktop stable tag'
  )
  return parsed
}

export async function readReleaseGitHubJson(endpoint) {
  const result = await runProcess({
    program: 'gh',
    args: ['api', endpoint],
    timeoutMs: 30_000,
    maxOutputBytes: 2 * 1024 * 1024
  })
  if (result.code !== 0 || result.timedOut || result.outputTruncated) {
    throw new Error(`GitHub release lookup failed: ${result.stderr.slice(0, 500)}`)
  }
  return JSON.parse(result.stdout)
}

export function assertOfficialRelease(release) {
  assert.equal(release.repository, ORCA_OFFICIAL_REPOSITORY)
  stableTag(release.tag)
  assert.match(release.commit, /^[a-f0-9]{40}$/)
  assert(Number.isSafeInteger(release.releaseId) && release.releaseId > 0)
  assert(Number.isFinite(Date.parse(release.publishedAt)), 'Missing publication time')
  assert.equal(
    release.url,
    `https://github.com/${ORCA_OFFICIAL_REPOSITORY}/releases/tag/${release.tag}`
  )
}

export async function discoverOfficialRelease(read = readReleaseGitHubJson) {
  const prefix = `repos/${ORCA_OFFICIAL_REPOSITORY}`
  const release = await read(`${prefix}/releases/latest`)
  assert.equal(release.draft, false, 'Draft releases cannot enter delivery')
  assert.equal(release.prerelease, false, 'Prereleases cannot enter delivery')
  stableTag(release.tag_name)
  const ref = await read(`${prefix}/git/ref/tags/${release.tag_name}`)
  let object = ref.object
  const visited = new Set()
  for (let depth = 0; object?.type === 'tag'; depth++) {
    assert.match(object.sha, /^[a-f0-9]{40}$/)
    assert(depth < 5 && !visited.has(object.sha), 'Invalid annotated tag chain')
    visited.add(object.sha)
    object = (await read(`${prefix}/git/tags/${object.sha}`)).object
  }
  assert.equal(object?.type, 'commit', 'Release tag must resolve to a commit')
  const discovered = {
    repository: ORCA_OFFICIAL_REPOSITORY,
    tag: release.tag_name,
    commit: object.sha,
    releaseId: release.id,
    publishedAt: release.published_at,
    url: `https://github.com/${ORCA_OFFICIAL_REPOSITORY}/releases/tag/${release.tag_name}`
  }
  assertOfficialRelease(discovered)
  return discovered
}

export function compareOfficialReleaseTags(left, right) {
  const a = stableTag(left)
  const b = stableTag(right)
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch
}
