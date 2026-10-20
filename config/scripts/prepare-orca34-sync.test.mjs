import { afterEach, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runProcess } from '@orca/process-host'
import { planOrca34Sync } from './plan-orca34-sync.mjs'
import { prepareOrca34Sync } from './prepare-orca34-sync.mjs'
const roots = []
async function git(source, args) {
  const result = await runProcess({ program: 'git', args, cwd: source, timeoutMs: 30000 })
  expect(result.code, result.stderr).toBe(0)
  return result.stdout.trim()
}
async function fixture(conflict = false) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'orca34-sync-source-')))
  roots.push(root)
  const source = join(root, 'source'),
    directory = join(root, 'state')
  await mkdir(source)
  await git(source, ['init', '-q'])
  await git(source, ['config', 'user.name', 'Fixture'])
  await git(source, ['config', 'user.email', 'fixture@example.invalid'])
  await git(source, ['config', 'commit.gpgSign', 'false'])
  await git(source, ['checkout', '-b', 'original'])
  await writeFile(join(source, 'settings.txt'), 'base\n')
  await git(source, ['add', '.'])
  await git(source, ['commit', '-qm', 'base'])
  await git(source, ['checkout', '-b', 'official'])
  await writeFile(join(source, conflict ? 'settings.txt' : 'official.txt'), 'official\n')
  await git(source, ['add', '.'])
  await git(source, ['commit', '-qm', 'official'])
  const target = await git(source, ['rev-parse', 'HEAD'])
  await git(source, ['checkout', 'original'])
  await writeFile(join(source, conflict ? 'settings.txt' : 'fork.txt'), 'fork\n')
  await git(source, ['add', '.'])
  await git(source, ['commit', '-qm', 'fork'])
  const base = await git(source, ['rev-parse', 'HEAD'])
  const release = {
    repository: 'stablyai/orca',
    tag: 'v1.4.232',
    commit: target,
    releaseId: 123,
    publishedAt: '2026-10-20T06:20:47Z',
    url: 'https://github.com/stablyai/orca/releases/tag/v1.4.232'
  }
  await planOrca34Sync(directory, {
    discover: async () => release,
    baselines: async () => ({ main: base, '34/local': base })
  })
  return {
    source,
    directory,
    tag: release.tag,
    stage: 'main',
    base,
    target,
    receipt: join(directory, 'sync', release.tag, 'main.json')
  }
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})
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
