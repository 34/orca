import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import {
  assertSeparateInstallPaths,
  createInstallSnapshot,
  inspectInstallTree,
  verifyInstallSnapshot,
  writeInstallReceipt
} from './orca34-install-snapshot.mjs'

const roots = []
afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true })
  }
})
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'orca34-snapshot-')))
  roots.push(root)
  const source = join(root, 'profile')
  await mkdir(source)
  await writeFile(join(source, 'session.db'), Buffer.from([0, 1, 2, 255]))
  return { root, source, snapshot: join(root, 'backup') }
}

it('copies binary contents and modes and refuses to replace an existing backup', async () => {
  const { source, snapshot } = await fixture()
  await chmod(join(source, 'session.db'), 0o600)
  const receipt = await createInstallSnapshot(source, snapshot)
  expect(receipt.entries).toEqual(await inspectInstallTree(source))
  expect(await verifyInstallSnapshot(snapshot)).toEqual(receipt)
  expect(JSON.parse(await readFile(join(snapshot, 'snapshot.json'), 'utf8'))).toEqual(receipt)
  await writeFile(join(source, 'session.db'), 'new session')
  expect(await readFile(join(snapshot, 'contents', 'session.db'))).toEqual(
    Buffer.from([0, 1, 2, 255])
  )
  await expect(createInstallSnapshot(source, snapshot)).rejects.toThrow()
})

it.skipIf(process.platform === 'win32')(
  'preserves link text without copying outside the profile',
  async () => {
    const { root, source, snapshot } = await fixture()
    await writeFile(join(root, 'outside'), 'private')
    await symlink('../outside', join(source, 'external'))
    const receipt = await createInstallSnapshot(source, snapshot)
    expect(receipt.entries.find((entry) => entry.name === 'external')).toEqual({
      name: 'external',
      type: 'link',
      target: '../outside'
    })
    await symlink(source, join(root, 'alias'))
    await expect(createInstallSnapshot(join(root, 'alias'), join(root, 'other'))).rejects.toThrow(
      'canonical'
    )
  }
)

it('rejects overlapping paths and preserves abandoned writes while publishing a retry', async () => {
  const { root, source } = await fixture()
  expect(() => assertSeparateInstallPaths([source, join(source, 'backup')])).toThrow('overlap')
  expect(() => assertSeparateInstallPaths([source, source])).toThrow('overlap')
  expect(() => assertSeparateInstallPaths(['relative', source])).toThrow('absolute')
  const path = join(root, 'state.json')
  await writeInstallReceipt(path, { phase: 'prepared' })
  await writeFile(`${path}.pending`, 'incomplete')
  await writeFile(`${path}.pending-abandoned`, '{"phase":')
  await writeInstallReceipt(path, { phase: 'installed' })
  expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ phase: 'installed' })
  expect(await readFile(`${path}.pending`, 'utf8')).toBe('incomplete')
  expect(await readFile(`${path}.pending-abandoned`, 'utf8')).toBe('{"phase":')
  expect((await readdir(root)).filter((entry) => entry.startsWith('state.json.pending'))).toEqual([
    'state.json.pending',
    'state.json.pending-abandoned'
  ])
})

it('does not replace committed state when serializing the next receipt fails', async () => {
  const { root } = await fixture()
  const path = join(root, 'state.json')
  await writeInstallReceipt(path, { phase: 'prepared' })
  await expect(writeInstallReceipt(path, { value: 1n })).rejects.toThrow()
  expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ phase: 'prepared' })
  expect(
    (await readdir(root)).filter((entry) => entry.startsWith('state.json.pending-'))
  ).toHaveLength(1)
  await writeInstallReceipt(path, { phase: 'installed' })
  expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ phase: 'installed' })
})

it('rejects a backup modified after its completion receipt', async () => {
  const { source, snapshot } = await fixture()
  await createInstallSnapshot(source, snapshot)
  await writeFile(join(snapshot, 'contents', 'session.db'), 'corrupt')
  await expect(verifyInstallSnapshot(snapshot)).rejects.toThrow('no longer matches')
})

it('omits runtime maintenance ownership only for an explicit profile snapshot', async () => {
  const { source, snapshot } = await fixture()
  const owners = join(source, '.profile-state-access')
  await mkdir(owners)
  await writeFile(join(owners, 'owner'), 'current host lease')
  const receipt = await createInstallSnapshot(source, snapshot, { excludeProfileAccess: true })
  expect(receipt.excludeProfileAccess).toBe(true)
  expect(receipt.entries.some((entry) => entry.name.startsWith('.profile-state-access'))).toBe(
    false
  )
  expect(await readFile(join(owners, 'owner'), 'utf8')).toBe('current host lease')
  await expect(
    readFile(join(snapshot, 'contents', '.profile-state-access', 'owner'))
  ).rejects.toThrow()
  expect(await verifyInstallSnapshot(snapshot)).toEqual(receipt)
})
