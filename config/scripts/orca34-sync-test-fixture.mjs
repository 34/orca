import { afterEach, expect } from 'vitest'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runProcess } from '@orca/process-host'
import { planOrca34Sync } from './plan-orca34-sync.mjs'
const roots = []
export async function git(source, args) {
  const result = await runProcess({ program: 'git', args, cwd: source, timeoutMs: 30000 })
  expect(result.code, result.stderr).toBe(0)
  return result.stdout.trim()
}
export async function fixture(conflict = false) {
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
