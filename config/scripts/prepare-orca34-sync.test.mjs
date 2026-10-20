import { expect, it } from 'vitest'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fixture, git } from './orca34-sync-test-fixture.mjs'
import { prepareOrca34Sync } from './prepare-orca34-sync.mjs'
it('merges on a new branch without committing and resumes without repeating the merge', async () => {
  const f = await fixture()
  const prepared = await prepareOrca34Sync(f)
  expect(prepared.phase).toBe('prepared')
  expect(await git(f.source, ['rev-parse', 'HEAD'])).toBe(f.base)
  expect(await git(f.source, ['rev-parse', 'MERGE_HEAD'])).toBe(f.target)
  expect(await readFile(join(f.source, 'fork.txt'), 'utf8')).toBe('fork\n')
  expect(await readFile(join(f.source, 'official.txt'), 'utf8')).toBe('official\n')
  expect(await prepareOrca34Sync(f)).toEqual(prepared)
})
it('preserves conflicts and accepts their staged resolution without committing it', async () => {
  const f = await fixture(true)
  expect(await prepareOrca34Sync(f)).toMatchObject({
    phase: 'conflicted',
    conflicts: ['settings.txt']
  })
  await writeFile(join(f.source, 'settings.txt'), 'official\nfork\n')
  await git(f.source, ['add', 'settings.txt'])
  expect(await prepareOrca34Sync(f)).toMatchObject({ phase: 'prepared', conflicts: [] })
  expect(await git(f.source, ['rev-parse', 'HEAD'])).toBe(f.base)
})
it('refuses dirty files and keeps their contents and branch', async () => {
  const f = await fixture()
  await writeFile(join(f.source, 'user.txt'), 'keep')
  await expect(prepareOrca34Sync(f)).rejects.toThrow('clean')
  expect(await git(f.source, ['symbolic-ref', '--short', 'HEAD'])).toBe('original')
  expect(await readFile(join(f.source, 'user.txt'), 'utf8')).toBe('keep')
})
it('does not adopt an unrelated existing branch', async () => {
  const f = await fixture()
  await git(f.source, ['branch', 'codex/orca34-sync-v1.4.232-main'])
  await expect(prepareOrca34Sync(f)).rejects.toThrow('without an ownership receipt')
})
it('does not repeat an interrupted Git operation with unverified termination', async () => {
  const f = await fixture()
  const state = await prepareOrca34Sync(f)
  await writeFile(f.receipt, JSON.stringify({ ...state, phase: 'merging' }))
  await expect(prepareOrca34Sync(f)).rejects.toThrow('unverifiable')
  expect(await git(f.source, ['rev-parse', 'MERGE_HEAD'])).toBe(f.target)
})
it('requires main admission before touching the local stage', async () => {
  const f = await fixture()
  await expect(
    prepareOrca34Sync(
      { ...f, stage: 'local', mainPr: 1, mainCommit: f.target },
      {
        inspect: async () => ({ state: 'pending' })
      }
    )
  ).rejects.toThrow('full PR admission')
  expect(await git(f.source, ['symbolic-ref', '--short', 'HEAD'])).toBe('original')
})
