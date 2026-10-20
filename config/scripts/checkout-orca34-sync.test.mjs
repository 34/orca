import { expect, it, vi } from 'vitest'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { runProcess } from '@orca/process-host'
import { fixture, git } from './orca34-sync-test-fixture.mjs'
import { checkoutOrca34Sync } from './checkout-orca34-sync.mjs'

async function setup() {
  const f = await fixture()
  await git(f.source, ['tag', f.tag, f.target])
  const run = vi.fn(async (spec) => {
    if (spec.args[0] !== 'fetch') {
      return runProcess(spec)
    }
    const args = [...spec.args]
    if (args[2] === 'https://github.com/34/orca.git') {
      expect(['refs/heads/main', 'refs/heads/34/local']).toContain(args[3])
      args[3] = 'refs/heads/original'
    } else {
      expect(args[2]).toBe('https://github.com/stablyai/orca.git')
      expect(args[3]).toBe(`refs/tags/${f.tag}`)
    }
    args[2] = f.source
    return runProcess({ ...spec, args })
  })
  const receipt = join(f.directory, 'sync', f.tag, 'main-checkout.json')
  return { f, run, receipt }
}
it('fetches pinned objects into separate owned checkouts and preserves later work on repeat', async () => {
  const s = await setup()
  const main = await checkoutOrca34Sync(s.f, s)
  const local = await checkoutOrca34Sync({ ...s.f, stage: 'local' }, s)
  expect(main.source).not.toBe(local.source)
  expect(await git(main.source, ['rev-parse', 'HEAD'])).toBe(s.f.base)
  expect(await git(local.source, ['cat-file', '-t', s.f.target])).toBe('commit')
  await writeFile(join(main.source, 'user-work.txt'), 'keep')
  expect(await checkoutOrca34Sync(s.f, s)).toEqual(main)
  expect(await readFile(join(main.source, 'user-work.txt'), 'utf8')).toBe('keep')
  expect(s.run.mock.calls.filter(([spec]) => spec.args[0] === 'fetch')).toHaveLength(4)
})
it('retains a failed checkout and never silently retries an uncertain process', async () => {
  const s = await setup()
  s.run.mockResolvedValue({ code: 0, stdout: '', stderr: '' })
  await expect(checkoutOrca34Sync(s.f, s)).rejects.toThrow('child exit')
  const saved = JSON.parse(await readFile(s.receipt, 'utf8'))
  expect(saved.phase).toBe('unverifiable')
  await expect(checkoutOrca34Sync(s.f, s)).rejects.toThrow('Interrupted checkout')
  expect(s.run).toHaveBeenCalledTimes(1)
})
it.each(['base', 'tag'])('rejects a moved %s before preparing a source', async (changed) => {
  const s = await setup()
  if (changed === 'tag') {
    await git(s.f.source, ['tag', '-f', s.f.tag, s.f.base])
  } else {
    await writeFile(join(s.f.source, 'new.txt'), 'changed')
    await git(s.f.source, ['add', '.'])
    await git(s.f.source, ['commit', '-qm', 'new baseline'])
  }
  await expect(checkoutOrca34Sync(s.f, s)).rejects.toThrow('moved before checkout')
  expect(JSON.parse(await readFile(s.receipt, 'utf8')).phase).toBe('unverifiable')
})
it('does not recreate a source missing from an existing ownership receipt', async () => {
  const s = await setup()
  const state = await checkoutOrca34Sync(s.f, s)
  await rm(state.source, { recursive: true })
  const count = s.run.mock.calls.length
  await expect(checkoutOrca34Sync(s.f, s)).rejects.toThrow()
  expect(s.run.mock.calls).toHaveLength(count)
  expect(JSON.parse(await readFile(s.receipt, 'utf8'))).toEqual(state)
})
it('rejects a receipt that redirects to an unrelated checkout', async () => {
  const s = await setup()
  const state = await checkoutOrca34Sync(s.f, s)
  await writeFile(s.receipt, JSON.stringify({ ...state, source: s.f.source }))
  await expect(checkoutOrca34Sync(s.f, s)).rejects.toThrow('escaped')
  expect(await git(s.f.source, ['rev-parse', 'HEAD'])).toBe(s.f.base)
})
