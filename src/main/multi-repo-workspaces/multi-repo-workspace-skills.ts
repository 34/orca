import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, realpath, rmdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import type { MultiRepoTask } from '../../shared/multi-repo-workspaces/multi-repo-workspace-contract'
import { createSkillPackageArchive } from '../skills/skill-package-creation'
import { installSharedSkill, removeSharedSkill } from '../skills/skill-install-service'
import { readSkillInstallReceipt } from '../skills/skill-install-provenance'
import { discoverSkills } from '../skills/discovery'
import type { MultiRepoWorkspaceServiceDependencies } from './multi-repo-workspace-service-contract'

export async function prepareMultiRepoWorkspaceSkills(
  task: MultiRepoTask,
  deps: Pick<MultiRepoWorkspaceServiceDependencies, 'journal' | 'installRootSkills'>
): Promise<MultiRepoTask> {
  if (
    task.context?.skillInstallation !== 'workspace' ||
    !task.context.skills.length ||
    task.skillInstallation?.state === 'ready'
  ) {
    return task
  }
  task.skillInstallation = { state: 'pending' }
  task = deps.journal.save(task, task.revision)
  try {
    await deps.installRootSkills(task)
    task.skillInstallation = { state: 'ready' }
  } catch (error) {
    task.skillInstallation = {
      state: 'failed',
      error: error instanceof Error ? error.message : String(error)
    }
  }
  return deps.journal.save(task, task.revision)
}

async function verifySkillWorkspace(task: MultiRepoTask): Promise<void> {
  assert(task.root.state === 'created' && task.root.folderWorkspaceId, 'Root is not registered')
  const root = task.plan.rootPath
  assert.equal(await realpath(root), root, 'Workspace root changed')
  const markerPath = join(root, '.orca-multi-repo.json')
  assert((await lstat(markerPath)).isFile(), 'Workspace marker is not a regular file')
  const marker = JSON.parse(await readFile(markerPath, 'utf8'))
  assert.equal(marker.taskId, task.taskId, 'Workspace marker changed')
  assert(isDeepStrictEqual(marker.members, task.plan.members), 'Workspace member plan changed')
}

export async function installMultiRepoWorkspaceSkills(
  task: MultiRepoTask,
  stateDirectory: string,
  hostIdentity: string
): Promise<void> {
  if (task.context?.skillInstallation !== 'workspace' || !task.context.skills.length) {
    return
  }
  await verifySkillWorkspace(task)
  const root = task.plan.rootPath
  const archives = join(stateDirectory, 'multi-repo-workspaces', 'skill-packages', task.taskId)
  await mkdir(archives, { recursive: true, mode: 0o700 })
  for (const skill of task.context.skills) {
    assert(isAbsolute(skill.path) && basename(skill.path) === 'SKILL.md', 'Invalid skill source')
    const source = await realpath(dirname(skill.path))
    assert((await lstat(join(source, 'SKILL.md'))).isFile(), 'Skill entry must be a regular file')
    const identity = createHash('sha256').update(source).digest('hex')
    const archive = await createSkillPackageArchive({
      sourceDirectory: source,
      archivePath: join(archives, `${identity}.tar.gz`),
      packageId: `multi-repo-${identity}`,
      versionId: task.taskId,
      createdAt: new Date(0).toISOString()
    })
    await verifySkillWorkspace(task)
    const result = await installSharedSkill({
      operationId: `${task.taskId}-${identity}`,
      archivePath: archive.archivePath,
      scope: 'workspace',
      homeDirectory: homedir(),
      workspaceDirectory: root,
      orcaStateDirectory: stateDirectory,
      detectedProviders: ['codex', 'cursor'],
      destinationIdentity: `workspace:${hostIdentity}:${task.root.folderWorkspaceId}`,
      hostIdentity,
      expectedArchiveSha256: archive.archiveSha256,
      expectedPackageDigest: archive.manifest.packageDigest,
      expectedPackageId: archive.manifest.packageId,
      expectedVersionId: archive.manifest.versionId,
      conflictResolution: 'replace-unmodified',
      discover: () =>
        discoverSkills({
          cwd: root,
          repos: [],
          sourceKinds: ['repo'],
          names: [archive.manifest.name],
          refresh: true
        })
    })
    if (result.status !== 'installed' && result.status !== 'unchanged') {
      throw new Error(`Workspace skill ${archive.manifest.name}: ${result.status}`)
    }
  }
}

export async function removeMultiRepoWorkspaceSkills(
  task: MultiRepoTask,
  stateDirectory: string,
  hostIdentity: string
): Promise<void> {
  if (task.context?.skillInstallation !== 'workspace') {
    return
  }
  await verifySkillWorkspace(task)
  const root = task.plan.rootPath
  const skills = join(root, '.agents', 'skills')
  for (const path of [join(root, '.agents'), skills]) {
    try {
      assert(
        (await lstat(path)).isDirectory() && (await realpath(path)) === path,
        'Workspace skill directory changed'
      )
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return
      }
      throw error
    }
  }
  for (const name of await readdir(skills)) {
    const path = join(skills, name)
    const receipt = await readSkillInstallReceipt(join(stateDirectory, 'skill-installs'), path)
    if (
      !receipt ||
      receipt.scope !== 'workspace' ||
      receipt.versionId !== task.taskId ||
      !receipt.packageId.startsWith('multi-repo-') ||
      receipt.canonicalPath !== path ||
      receipt.hostIdentity !== hostIdentity ||
      receipt.destinationIdentity !== `workspace:${hostIdentity}:${task.root.folderWorkspaceId}`
    ) {
      continue
    }
    await verifySkillWorkspace(task)
    const removed = await removeSharedSkill({
      operationId: `${task.taskId}-remove-${name}`,
      skillName: name,
      scope: 'workspace',
      homeDirectory: homedir(),
      workspaceDirectory: root,
      orcaStateDirectory: stateDirectory,
      detectedProviders: ['codex', 'cursor']
    })
    if (removed.status !== 'removed' && removed.status !== 'unchanged') {
      throw new Error(`Workspace skill ${name}: ${removed.status}`)
    }
  }
  for (const path of [skills, join(root, '.agents')]) {
    await verifySkillWorkspace(task)
    await rmdir(path).catch((error: unknown) => {
      if (
        !(
          error instanceof Error &&
          'code' in error &&
          ['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(String(error.code))
        )
      ) {
        throw error
      }
    })
  }
}
