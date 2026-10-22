import { mkdtemp, mkdir, lstat, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, expect, it } from 'vitest'
import {
  readMultiRepoParentDirectory,
  resolveMultiRepoParentDirectory,
  prepareMultiRepoDefaultParentDirectory,
  saveMultiRepoParentDirectory
} from './multi-repo-parent-directory'

let root: string
beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'orca-multi-parent-')))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

it('suggests a dedicated absolute default without creating files or directories', async () => {
  const profile = join(root, 'profile')
  const defaultParentPath = join(root, 'multi-repo-workspaces')
  expect(readMultiRepoParentDirectory(profile, root)).toEqual({
    parentPath: defaultParentPath,
    defaultParentPath
  })
  await expect(lstat(defaultParentPath)).rejects.toMatchObject({ code: 'ENOENT' })
  await expect(lstat(profile)).rejects.toMatchObject({ code: 'ENOENT' })
  expect(readMultiRepoParentDirectory(profile, '.worktrees').parentPath).toBe('')
  expect(
    readMultiRepoParentDirectory(profile, '\\\\wsl.localhost\\Ubuntu\\workspaces').parentPath
  ).toBe('')
})

it('creates the dedicated default only explicitly and persists the canonical choice per profile', async () => {
  const parent = await prepareMultiRepoDefaultParentDirectory(root, () => {})
  expect(parent).toBe(join(root, 'multi-repo-workspaces'))
  expect(await prepareMultiRepoDefaultParentDirectory(root, () => {})).toBe(parent)
  const selected = await resolveMultiRepoParentDirectory(parent)
  saveMultiRepoParentDirectory(join(root, 'profile-a'), selected)
  expect(readMultiRepoParentDirectory(join(root, 'profile-a'), '.worktrees').parentPath).toBe(
    parent
  )
  expect(readMultiRepoParentDirectory(join(root, 'profile-b'), '.worktrees').parentPath).toBe('')
})

it('refuses relative paths, missing selected directories, files and replaced default directories', async () => {
  await expect(resolveMultiRepoParentDirectory('relative')).rejects.toThrow('absolute')
  await expect(resolveMultiRepoParentDirectory(join(root, 'missing'))).rejects.toMatchObject({
    code: 'ENOENT'
  })
  const file = join(root, 'file')
  await writeFile(file, 'retain')
  await expect(resolveMultiRepoParentDirectory(file)).rejects.toThrow('directory')
  await mkdir(join(root, 'target'))
  await symlink(
    join(root, 'target'),
    join(root, 'multi-repo-workspaces'),
    process.platform === 'win32' ? 'junction' : 'dir'
  )
  await expect(prepareMultiRepoDefaultParentDirectory(root, () => {})).rejects.toThrow(
    'real directory'
  )
})

it('checks active profile authority before creating the default directory', async () => {
  await expect(
    prepareMultiRepoDefaultParentDirectory(root, () => {
      throw new Error('profile changed')
    })
  ).rejects.toThrow('profile changed')
  await expect(lstat(join(root, 'multi-repo-workspaces'))).rejects.toMatchObject({ code: 'ENOENT' })
})
