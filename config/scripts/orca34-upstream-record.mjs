import assert from 'node:assert/strict'
import { mkdir, readFile, realpath } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tsImport } from 'tsx/esm/api'
import { writeInstallReceipt } from './orca34-install-snapshot.mjs'
import { assertOfficialRelease, compareOfficialReleaseTags } from './orca34-upstream-discovery.mjs'

async function readRecord(path) {
  try {
    const record = JSON.parse(await readFile(path, 'utf8'))
    assert.equal(record.schemaVersion, 1, 'Unsupported upstream record')
    assertOfficialRelease(record.release)
    return record
  } catch (error) {
    if (error.code === 'ENOENT') {
      return undefined
    }
    throw error
  }
}

export async function withUpstreamReleaseLease(directory, action) {
  const root = resolve(directory)
  await mkdir(root, { recursive: true, mode: 0o700 })
  assert.equal(await realpath(root), root, 'Release state must use a canonical directory')
  const { acquireProfileStateMaintenance } = await tsImport(
    '../../src/main/persistence/profile-state/profile-state-access.ts',
    import.meta.url
  )
  const lease = acquireProfileStateMaintenance(root)
  try {
    return await action(root, lease)
  } finally {
    lease.release()
  }
}

// The caller holds the release-directory lease across discovery and publication.
export async function observeOfficialRelease(root, release, lease) {
  lease.assertActive()
  assertOfficialRelease(release)
  const path = join(root, `${release.tag}.json`)
  const known = await readRecord(path)
  if (known) {
    assert.equal(known.release.tag, release.tag)
    assert.equal(known.release.commit, release.commit, 'Official release tag changed its commit')
  }
  const latestPath = join(root, 'latest.json')
  const latest = await readRecord(latestPath)
  if (latest) {
    const order = compareOfficialReleaseTags(release.tag, latest.release.tag)
    if (order < 0) {
      return { changed: false, disposition: 'older-release', release }
    }
    if (order === 0) {
      assert.equal(latest.release.commit, release.commit, 'Official release tag changed its commit')
      assert(known, 'Latest release has lost its delivery record')
    }
  }
  const record = known ?? { schemaVersion: 1, release, phase: 'discovered' }
  lease.assertActive()
  if (!known) {
    await writeInstallReceipt(path, record)
  }
  const changed = !latest || latest.release.tag !== release.tag
  if (changed) {
    await writeInstallReceipt(latestPath, { schemaVersion: 1, release })
  }
  return { changed, disposition: known ? 'known-release' : 'new-release', record }
}
