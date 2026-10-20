import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { planOrca34Sync, readOrca34Baselines } from './plan-orca34-sync.mjs'
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
const baseline = { main: 'b'.repeat(40), '34/local': 'c'.repeat(40) }
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'orca34-sync-plan-')))
  roots.push(root)
  return {
    root,
    receipt: join(root, 'sync', release.tag, 'plan.json'),
    deps: { discover: async () => release, baselines: vi.fn(async () => baseline) }
  }
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})
it('pins both baselines and keeps them after main has advanced', async () => {
  const { root, receipt, deps } = await fixture()
  const plan = await planOrca34Sync(root, deps)
  expect(plan.stages).toEqual([
    {
      base: 'main',
      baseCommit: baseline.main,
      branch: 'codex/orca34-sync-v1.4.232-main',
      mergeFrom: release.commit
    },
    {
      base: '34/local',
      baseCommit: baseline['34/local'],
      branch: 'codex/orca34-sync-v1.4.232-local',
      mergeFrom: 'verified-main'
    }
  ])
  const before = await readFile(receipt, 'utf8')
  deps.baselines.mockResolvedValue({ ...baseline, main: 'd'.repeat(40) })
  expect(await planOrca34Sync(root, deps)).toEqual(plan)
  expect(await readFile(receipt, 'utf8')).toBe(before)
  expect(deps.baselines).toHaveBeenCalledTimes(2)
})
it.each(['branch', 'release', 'offline'])('does not publish a plan on %s changes', async (mode) => {
  const { root, receipt, deps } = await fixture()
  if (mode === 'branch') {
    deps.baselines
      .mockResolvedValueOnce(baseline)
      .mockResolvedValueOnce({ ...baseline, main: 'd'.repeat(40) })
  }
  if (mode === 'release') {
    deps.discover = vi
      .fn()
      .mockResolvedValueOnce(release)
      .mockResolvedValueOnce({ ...release, commit: 'd'.repeat(40) })
  }
  if (mode === 'offline') {
    deps.baselines.mockRejectedValue(new Error('offline'))
  }
  await expect(planOrca34Sync(root, deps)).rejects.toThrow()
  await expect(readFile(receipt)).rejects.toMatchObject({ code: 'ENOENT' })
})
it('rejects malformed saved plans and concurrent workers', async () => {
  const { root, receipt, deps } = await fixture()
  await withUpstreamReleaseLease(root, async () => {
    await expect(planOrca34Sync(root, deps)).rejects.toThrow()
  })
  await planOrca34Sync(root, deps)
  await writeFile(receipt, JSON.stringify({ schemaVersion: 1, repository: 'wrong' }))
  await expect(planOrca34Sync(root, deps)).rejects.toThrow()
})
it('validates the exact main/local ref identities returned by GitHub', async () => {
  const read = vi.fn(async (endpoint) => {
    const name = endpoint.endsWith('/34/local') ? '34/local' : 'main'
    return { ref: `refs/heads/${name}`, object: { type: 'commit', sha: baseline[name] } }
  })
  expect(await readOrca34Baselines(read)).toEqual(baseline)
  read.mockResolvedValue({ ref: 'refs/heads/main', object: { type: 'tag', sha: baseline.main } })
  await expect(readOrca34Baselines(read)).rejects.toThrow()
})
