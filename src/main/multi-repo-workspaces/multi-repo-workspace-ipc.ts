import { stopMultiRepoRootForCleanup } from './multi-repo-workspace-root-stop'
import { launchMultiRepoRootAgent } from './multi-repo-workspace-agent'
import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { readFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import type { Store } from '../persistence'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import { isTrustedUIRenderer } from '../ipc/ui'
import { getOrcaProfileListState } from '../orca-profiles/profile-index-store'
import { getOrcaProfileDirectory } from '../orca-profiles/profile-storage-paths'
import { durableWriteTempPath, writeFileDurable } from '../durable-file-write'
import {
  multiRepoRemoveMemberRequestSchema,
  multiRepoCreateRequestSchema,
  multiRepoTaskIdSchema
} from '../../shared/multi-repo-workspaces/multi-repo-workspace-contract'
import { MultiRepoWorkspaceStore } from './multi-repo-workspace-store'
import { MultiRepoWorkspaceService } from './multi-repo-workspace-service'

const closeOwners = new WeakMap<object, () => Promise<void>>()
export function hasMultiRepoWorkspaceOwner(store: object): boolean {
  return closeOwners.has(store)
}

export async function closeMultiRepoWorkspaceOwner(store: object): Promise<void> {
  await closeOwners.get(store)?.()
}

export function registerMultiRepoWorkspaceHandlers(
  store: Store,
  runtime: OrcaRuntimeService
): void {
  const profileId = getOrcaProfileListState().activeProfileId
  const profilePath = getOrcaProfileDirectory(profileId)
  const journal = new MultiRepoWorkspaceStore(profilePath, profileId)
  let groupPromise: Promise<string> | undefined
  const getProjectGroupId = (): Promise<string> => {
    groupPromise ??= (async () => {
      const directory = join(profilePath, 'multi-repo-workspaces')
      const path = join(directory, 'group.json')
      try {
        const config = z
          .object({ groupId: z.string().min(1).optional() })
          .parse(JSON.parse(await readFile(path, 'utf8')))
        if (!config.groupId) {
          throw new Error('Multi-repo group creation was interrupted; reconcile it before retrying')
        }
        if (!runtime.listProjectGroups().some((group) => group.id === config.groupId)) {
          throw new Error('Multi-repo project group was removed; restore the entry explicitly')
        }
        return config.groupId
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
          throw error
        }
      }
      await mkdir(directory, { recursive: true, mode: 0o700 })
      await writeFileDurable(durableWriteTempPath(path), path, '{}')
      const group = await runtime.createProjectGroup({ name: '多仓库需求工作区' })
      await writeFileDurable(
        durableWriteTempPath(path),
        path,
        JSON.stringify({ groupId: group.id })
      )
      return group.id
    })()
    return groupPromise
  }
  const service = new MultiRepoWorkspaceService({
    store,
    runtime,
    journal,
    profileId,
    getProjectGroupId,
    stopRootForCleanup: (task) => stopMultiRepoRootForCleanup(task, runtime),
    launchRootAgent: (task, replay) => launchMultiRepoRootAgent(runtime, task, replay)
  })
  closeOwners.set(store, () => service.close())
  const authorize = (event: IpcMainInvokeEvent): void => {
    if (!isTrustedUIRenderer(event.sender) || event.senderFrame !== event.sender.mainFrame) {
      throw new Error('Unauthorized multi-repo workspace sender')
    }
    if (getOrcaProfileListState().activeProfileId !== profileId) {
      throw new Error('Multi-repo request belongs to an inactive profile')
    }
  }
  ipcMain.handle('multiRepoWorkspaces:list', (event) => {
    authorize(event)
    return journal.list()
  })
  ipcMain.handle('multiRepoWorkspaces:removeMember', (event, input: unknown) => {
    authorize(event)
    const request = multiRepoRemoveMemberRequestSchema.parse(input)
    return service.removeMember(request.taskId, request.repoId, request.revision)
  })
  ipcMain.handle('multiRepoWorkspaces:stopRootForCleanup', (event, input: unknown) => {
    authorize(event)
    return service.stopRootForCleanup(multiRepoTaskIdSchema.parse(input))
  })
  ipcMain.handle('multiRepoWorkspaces:previewRemoval', (event, input: unknown) => {
    authorize(event)
    return service.previewRemoval(multiRepoTaskIdSchema.parse(input))
  })
  ipcMain.handle('multiRepoWorkspaces:get', (event, input: unknown) => {
    authorize(event)
    return journal.get(multiRepoTaskIdSchema.parse(input))
  })
  ipcMain.handle('multiRepoWorkspaces:create', async (event, input: unknown) => {
    authorize(event)
    const task = await service.create(multiRepoCreateRequestSchema.parse(input))
    void service.run(task.taskId).catch((error: unknown) => {
      console.error('[multi-repo] Task creation requires attention', task.taskId, error)
    })
    return task
  })
  ipcMain.handle('multiRepoWorkspaces:continue', (event, input: unknown) => {
    authorize(event)
    return service.run(multiRepoTaskIdSchema.parse(input), true)
  })
}
