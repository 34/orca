import { afterEach, expect, it } from 'vitest'
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runUpstreamDiscovery } from './discover-orca34-upstream.mjs'
import { withUpstreamReleaseLease } from './orca34-upstream-record.mjs'

const roots = []
const release = {
  repository: 'stablyai/orca',
  tag: 'v1.4.232',
  commit: 'a'.repeat(40),
  releaseId: 123,
  publishedAt: '2026-10-20T06:20:47Z',
  url: 'https://github.com/stablyai/orca/releases/tag/v1.4.232'
}
async function directory() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'orca34-upstream-')))
  roots.push(root)
  return root
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

it('records one release and leaves repeated observations unchanged', async () => {
  const root = await directory()
  expect((await runUpstreamDiscovery(root, async () => release)).changed).toBe(true)
  const before = await readFile(join(root, `${release.tag}.json`), 'utf8')
  expect(await runUpstreamDiscovery(root, async () => release)).toMatchObject({
    changed: false,
    disposition: 'known-release'
  })
  expect(await readFile(join(root, `${release.tag}.json`), 'utf8')).toBe(before)
  await expect(
    runUpstreamDiscovery(root, async () => ({ ...release, commit: 'b'.repeat(40) }))
  ).rejects.toThrow('changed its commit')
  expect(await readFile(join(root, `${release.tag}.json`), 'utf8')).toBe(before)
})

it('does not schedule an older release when GitHub latest points backwards', async () => {
  const root = await directory()
  await runUpstreamDiscovery(root, async () => release)
  const older = { ...release, tag: 'v1.4.231', url: release.url.replace('232', '231') }
  expect(await runUpstreamDiscovery(root, async () => older)).toMatchObject({
    changed: false,
    disposition: 'older-release'
  })
  await expect(readFile(join(root, `${older.tag}.json`))).rejects.toMatchObject({ code: 'ENOENT' })
})

it('rejects concurrent discovery and releases the lease after a network failure', async () => {
  const root = await directory()
  await withUpstreamReleaseLease(root, async () => {
    await expect(runUpstreamDiscovery(root, async () => release)).rejects.toThrow()
  })
  await expect(
    runUpstreamDiscovery(root, async () => {
      throw new Error('offline')
    })
  ).rejects.toThrow('offline')
  expect((await runUpstreamDiscovery(root, async () => release)).changed).toBe(true)
})

it('recovers discovery after publication of the per-release record but not the latest pointer', async () => {
  const root = await directory()
  await runUpstreamDiscovery(root, async () => release)
  await rm(join(root, 'latest.json'))
  expect((await runUpstreamDiscovery(root, async () => release)).changed).toBe(true)
  expect(JSON.parse(await readFile(join(root, 'latest.json'), 'utf8')).release).toEqual(release)
})
