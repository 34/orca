import { expect, it, vi } from 'vitest'
import { readFile, rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { runProcess } from '@orca/process-host'
import { fixture, git } from './orca34-sync-test-fixture.mjs'
import { prepareOrca34Sync } from './prepare-orca34-sync.mjs'
import { commitOrca34Sync } from './commit-orca34-sync.mjs'
import { publishOrca34Sync } from './publish-orca34-sync.mjs'
const body =
  '## ELI5\nSync official changes.\n## What Changed\nPreserve fork work.\n## Why\nReview before delivery.\n## Testing\nLocal validation passed; full CI pending.\n'
const passed = { code: 0, stdout: '', stderr: '', timedOut: false, outputTruncated: false }
async function setup() {
  const f = { ...(await fixture()), body }
  await prepareOrca34Sync(f)
  const localRun = async (spec) => {
    if (spec.program !== 'pnpm') {
      return runProcess(spec)
    }
    spec.onChildTerminated?.()
    return passed
  }
  const commit = await commitOrca34Sync(f, { run: localRun })
  const remote = join(dirname(f.source), 'remote.git')
  await git(f.source, ['init', '--bare', remote])
  await git(f.source, ['push', remote, `${f.base}:refs/heads/main`])
  let prs = []
  const run = vi.fn(async (spec) => {
    if (spec.program === 'gh') {
      if (spec.input) {
        const input = JSON.parse(spec.input)
        expect(input).toMatchObject({ head: commit.branch, base: 'main', body })
        prs = [
          {
            number: 42,
            state: 'open',
            html_url: 'https://github.com/34/orca/pull/42',
            head: { ref: commit.branch, sha: commit.commit, repo: { full_name: '34/orca' } },
            base: { ref: 'main', sha: f.base, repo: { full_name: '34/orca' } }
          }
        ]
      }
      spec.onChildTerminated?.()
      return { ...passed, stdout: JSON.stringify(spec.input ? prs[0] : prs) }
    }
    return localRun({
      ...spec,
      args: spec.args.map((arg) => (arg === 'git@github.com:34/orca.git' ? remote : arg))
    })
  })
  return { f, commit, remote, run, prs: () => prs }
}
it('pushes only the candidate and creates one PR across repeated runs', async () => {
  const { f, commit, remote, run } = await setup()
  const result = await publishOrca34Sync(f, { run })
  expect(result).toMatchObject({ phase: 'published', number: 42 })
  expect(await publishOrca34Sync(f, { run })).toEqual(result)
  expect(await git(f.source, ['ls-remote', remote, 'refs/heads/main'])).toContain(f.base)
  expect(await git(f.source, ['ls-remote', remote, `refs/heads/${commit.branch}`])).toContain(
    commit.commit
  )
  expect(run.mock.calls.filter(([s]) => s.program === 'gh' && s.input)).toHaveLength(1)
  expect(run.mock.calls.filter(([s]) => s.args[0] === 'push')).toHaveLength(1)
  expect(run.mock.calls.some(([s]) => s.args.some((arg) => arg.includes('--force')))).toBe(false)
})
it('refuses another commit at the remote candidate branch without overwriting it', async () => {
  const { f, commit, remote, run } = await setup()
  await git(f.source, ['push', remote, `${f.base}:refs/heads/${commit.branch}`])
  await expect(publishOrca34Sync(f, { run })).rejects.toThrow('another owner')
  expect(run.mock.calls.some(([s]) => s.program === 'gh' || s.args[0] === 'push')).toBe(false)
})
it('refuses changed long-term baselines before publication', async () => {
  const { f, commit, remote, run } = await setup()
  await git(f.source, ['push', remote, `${commit.commit}:refs/heads/main`])
  await expect(publishOrca34Sync(f, { run })).rejects.toThrow('Remote base changed')
  expect(run.mock.calls.some(([s]) => s.program === 'gh' || s.args[0] === 'push')).toBe(false)
})
it('does not create a commit while publishing an uncommitted candidate', async () => {
  const f = { ...(await fixture()), body }
  await prepareOrca34Sync(f)
  await expect(publishOrca34Sync(f)).rejects.toThrow('already be committed')
  expect(await git(f.source, ['rev-parse', 'HEAD'])).toBe(f.base)
})
it('does not repeat an ambiguous PR creation', async () => {
  const { f, run } = await setup()
  const uncertain = async (spec) => {
    const result = await run(spec)
    return spec.program === 'gh' && spec.input ? { ...result, timedOut: true } : result
  }
  await expect(publishOrca34Sync(f, { run: uncertain })).rejects.toThrow('did not finish')
  await expect(publishOrca34Sync(f, { run })).rejects.toThrow('unverifiable')
  expect(run.mock.calls.filter(([s]) => s.program === 'gh' && s.input)).toHaveLength(1)
  const receipt = JSON.parse(
    await readFile(join(f.directory, 'sync', f.tag, 'main-publication.json'), 'utf8')
  )
  expect(receipt.phase).toBe('unverifiable')
})
it('rejects changed PR identity on a repeated invocation', async () => {
  const { f, run, prs } = await setup()
  await publishOrca34Sync(f, { run })
  prs()[0].head.sha = 'a'.repeat(40)
  await expect(publishOrca34Sync(f, { run })).rejects.toThrow('PR head changed')
})
it('keeps the original PR description immutable', async () => {
  const { f, run } = await setup()
  await publishOrca34Sync(f, { run })
  await expect(publishOrca34Sync({ ...f, body: `${body}Changed` }, { run })).rejects.toThrow(
    'description changed'
  )
})

it('adopts the exact existing PR after a missing publication receipt without creating a duplicate', async () => {
  const { f, run } = await setup()
  await publishOrca34Sync(f, { run })
  await rm(join(f.directory, 'sync', f.tag, 'main-publication.json'))
  expect(await publishOrca34Sync(f, { run })).toMatchObject({ phase: 'published', number: 42 })
  expect(run.mock.calls.filter(([s]) => s.program === 'gh' && s.input)).toHaveLength(1)
})
it('stops after a push whose child termination is unknown', async () => {
  const { f, run } = await setup()
  const uncertain = (spec) =>
    run(spec.args[0] === 'push' ? { ...spec, onChildTerminated: undefined } : spec)
  await expect(publishOrca34Sync(f, { run: uncertain })).rejects.toThrow('unverifiable')
  await expect(publishOrca34Sync(f, { run })).rejects.toThrow('unverifiable')
  expect(run.mock.calls.some(([s]) => s.program === 'gh')).toBe(false)
})
it('does not report publication complete if the baseline moves while creating the PR', async () => {
  const { f, commit, remote, run } = await setup()
  const changed = async (spec) => {
    const result = await run(spec)
    if (spec.program === 'gh' && spec.input) {
      await git(f.source, ['push', remote, `${commit.commit}:refs/heads/main`])
    }
    return result
  }
  await expect(publishOrca34Sync(f, { run: changed })).rejects.toThrow(
    'Remote base changed during PR'
  )
})
