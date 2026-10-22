import { mkdirSync, readFileSync } from 'node:fs'
import { lstat, mkdir, realpath } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { z } from 'zod'
import { isWslUncPath } from '../../shared/wsl-paths'
import { durableWriteTempPath, writeFileDurableSync } from '../durable-file-write'

const preferencesSchema = z.object({ parentPath: z.string().min(1) }).strict()

function assertNativeAbsolute(path: string): void {
  if (!isAbsolute(path) || isWslUncPath(path)) {
    throw new Error('Choose an absolute native-local parent directory')
  }
}

export function readMultiRepoParentDirectory(profilePath: string, workspaceDir: string) {
  let parentPath = ''
  try {
    parentPath = preferencesSchema.parse(
      JSON.parse(
        readFileSync(join(profilePath, 'multi-repo-workspaces', 'preferences.json'), 'utf8')
      )
    ).parentPath
    assertNativeAbsolute(parentPath)
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
      throw error
    }
  }
  const defaultParentPath =
    isAbsolute(workspaceDir) && !isWslUncPath(workspaceDir)
      ? join(workspaceDir, 'multi-repo-workspaces')
      : undefined
  return { parentPath: parentPath || defaultParentPath || '', defaultParentPath }
}

export async function resolveMultiRepoParentDirectory(path: string): Promise<string> {
  assertNativeAbsolute(path)
  const resolved = await realpath(path)
  if (!(await lstat(resolved)).isDirectory()) {
    throw new Error('Workspace parent must be a directory')
  }
  return resolved
}

export async function prepareMultiRepoDefaultParentDirectory(
  workspaceDir: string,
  assertActive: () => void
): Promise<string> {
  const base = await resolveMultiRepoParentDirectory(workspaceDir)
  const path = join(base, 'multi-repo-workspaces')
  assertActive()
  try {
    await mkdir(path)
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) {
      throw error
    }
  }
  if (!(await lstat(path)).isDirectory()) {
    throw new Error('Default workspace parent must be a real directory')
  }
  return resolveMultiRepoParentDirectory(path)
}

export function saveMultiRepoParentDirectory(profilePath: string, parentPath: string): void {
  assertNativeAbsolute(parentPath)
  const directory = join(profilePath, 'multi-repo-workspaces')
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const path = join(directory, 'preferences.json')
  writeFileDurableSync(durableWriteTempPath(path), path, JSON.stringify({ parentPath }))
}
