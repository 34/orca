import { afterEach, expect, it } from 'vitest'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { nextOrca34Notice, readOrca34ReleaseNotice } from './orca34-release-notice.mjs'
const roots = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})
async function fixture() {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'orca34-notice-')))
  roots.push(directory)
  const state = {
    schemaVersion: 1,
    directory,
    notification: nextOrca34Notice(undefined, {
      kind: 'failed',
      message: 'offline',
      context: 'main'
    })
  }
  const save = () => writeFile(join(directory, 'release-run.json'), JSON.stringify(state))
  await save()
  return { directory, state, save }
}
it('keeps the sequence across transient work and repeats, but separates stages', () => {
  const notice = { kind: 'failed', message: 'offline', context: 'main' }
  const first = nextOrca34Notice(undefined, notice)
  expect(nextOrca34Notice(nextOrca34Notice(first, null), notice)).toEqual(first)
  expect(nextOrca34Notice(first, { ...notice, context: 'local' }).sequence).toBe(2)
  expect(nextOrca34Notice(first, { kind: 'candidate-ready', message: '/candidate' }).sequence).toBe(
    2
  )
})
it('does not consume on read, acknowledges delivery, and exposes the next event', async () => {
  const f = await fixture()
  expect(await readOrca34ReleaseNotice(f.directory)).toMatchObject({
    pending: true,
    deliveredSequence: 0
  })
  expect(await readOrca34ReleaseNotice(f.directory)).toMatchObject({ pending: true })
  expect(await readOrca34ReleaseNotice(f.directory, 1)).toMatchObject({
    pending: false,
    deliveredSequence: 1
  })
  expect(await readOrca34ReleaseNotice(f.directory, 1)).toMatchObject({ pending: false })
  f.state.notification = nextOrca34Notice(f.state.notification, {
    kind: 'candidate-ready',
    message: '/candidate'
  })
  await f.save()
  expect(await readOrca34ReleaseNotice(f.directory)).toMatchObject({
    pending: true,
    notice: { sequence: 2 }
  })
  await expect(readOrca34ReleaseNotice(f.directory, 1)).rejects.toThrow('changed')
  expect(
    JSON.parse(await readFile(join(f.directory, 'notice-delivery.json'), 'utf8')).sequence
  ).toBe(1)
})
it('hides inactive results and refuses to acknowledge a superseded notice', async () => {
  const f = await fixture()
  f.state.notification = nextOrca34Notice(f.state.notification, null)
  await f.save()
  expect(await readOrca34ReleaseNotice(f.directory)).toMatchObject({ pending: false, notice: null })
  await expect(readOrca34ReleaseNotice(f.directory, 1)).rejects.toThrow('no longer active')
})
it('rejects corrupt counters instead of suppressing future notifications', async () => {
  const f = await fixture()
  await writeFile(
    join(f.directory, 'notice-delivery.json'),
    JSON.stringify({ schemaVersion: 1, sequence: 99 })
  )
  await expect(readOrca34ReleaseNotice(f.directory)).rejects.toThrow('backwards')
  expect(() =>
    nextOrca34Notice(
      { ...f.state.notification, sequence: Number.MAX_SAFE_INTEGER },
      { kind: 'failed', message: 'changed' }
    )
  ).toThrow('exhausted')
})
