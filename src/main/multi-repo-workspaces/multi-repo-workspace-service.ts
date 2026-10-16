import { restoreMultiRepoRoot } from './multi-repo-workspace-root-restore'
import {
  removeMultiRepoRoot,
  stopRegisteredMultiRepoRoot
} from './multi-repo-workspace-root-removal'
import { removeMultiRepoMember } from './multi-repo-workspace-removal'
import type { OrcaRuntimeWithRemoveManagedWorktree } from '../runtime/workspaces/workspace-removal'
import { previewMultiRepoRemoval } from './multi-repo-workspace-removal-preview'
import { observeMultiRepoSetup, recoverMultiRepoSetup } from './multi-repo-workspace-setup'
import {
  startMultiRepoRootAgent,
  type launchMultiRepoRootAgent
} from './multi-repo-workspace-agent'
import { randomUUID } from 'node:crypto'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import { mkdir, realpath, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Repo } from '../../shared/repo-types'
import type { RuntimeStore } from '../runtime/runtime-store-contract'
import {
  multiRepoTaskIdSchema,
  type MultiRepoTask,
  type MultiRepoCreateRequest
} from '../../shared/multi-repo-workspaces/multi-repo-workspace-contract'
import type { ProjectRuntimeResolutionStore } from '../local-project-runtime-resolution'
import type { RuntimeRepositoryCommandSurface } from '../runtime/runtime-repository-command-surface'
import type { OrcaRuntimeWithCreateManagedWorktree } from '../runtime/workspaces/workspace-creation'
import { planMultiRepoWorkspace } from './multi-repo-workspace-plan'
import { bindMultiRepoWorkspaceOwner } from './multi-repo-workspace-placement'
import { recoverMultiRepoMembers } from './multi-repo-workspace-recovery'
import { multiRepoRootFiles, recoverMultiRepoRootFiles } from './multi-repo-workspace-root-files'
import { reconcileMultiRepoRootRegistration } from './multi-repo-workspace-root-registration'
import type { MultiRepoWorkspaceStore } from './multi-repo-workspace-store'

type Runtime = Pick<
  RuntimeRepositoryCommandSurface,
  'createFolderWorkspace' | 'listFolderWorkspaces' | 'deleteFolderWorkspace' | 'listProjectGroups'
> &
  Pick<OrcaRuntimeWithCreateManagedWorktree, 'createManagedWorktree'> &
  Pick<OrcaRuntimeService, 'waitForSetupTerminalCompletion' | 'acquireFileWatcherRemoval'> &
  Pick<OrcaRuntimeWithRemoveManagedWorktree, 'removeManagedWorktree'>
export type { MultiRepoCreateRequest } from '../../shared/multi-repo-workspaces/multi-repo-workspace-contract'

export class MultiRepoWorkspaceService {
  private readonly pending = new Map<string, Promise<MultiRepoTask>>()
  private readonly unbind: () => void
  private closing = false

  constructor(
    private readonly deps: {
      store: ProjectRuntimeResolutionStore &
        Pick<RuntimeStore, 'getWorktreeMeta'> & { getRepo: (id: string) => Repo | undefined }
      journal: MultiRepoWorkspaceStore
      runtime: Runtime
      profileId: string
      getProjectGroupId: () => Promise<string>
      stopRootForCleanup: (task: MultiRepoTask) => Promise<void>
      launchRootAgent: (
        task: MultiRepoTask,
        replay: boolean
      ) => ReturnType<typeof launchMultiRepoRootAgent>
    }
  ) {
    this.unbind = bindMultiRepoWorkspaceOwner(deps.store, deps.journal)
  }

  async close(): Promise<void> {
    this.closing = true
    await Promise.allSettled(this.pending.values())
    this.unbind()
  }

  private serialize(
    taskId: string,
    operation: () => Promise<MultiRepoTask>
  ): Promise<MultiRepoTask> {
    if (this.closing) {
      return Promise.reject(new Error('Multi-repo profile is closing'))
    }
    const existing = this.pending.get(taskId)
    if (existing) {
      return existing
    }
    const promise = operation().finally(() => {
      this.pending.delete(taskId)
    })
    this.pending.set(taskId, promise)
    return promise
  }

  create(request: MultiRepoCreateRequest): Promise<MultiRepoTask> {
    const taskId = multiRepoTaskIdSchema.parse(request.requestId)
    return this.serialize(taskId, async () => {
      const existing = this.deps.journal.get(taskId)
      if (existing) {
        return existing
      }
      const plan = await planMultiRepoWorkspace({ ...request, store: this.deps.store })
      if (this.closing) {
        throw new Error('Multi-repo profile is closing')
      }
      return this.deps.journal.save(
        {
          schemaVersion: 1,
          taskId,
          requestId: taskId,
          revision: 0,
          profileId: this.deps.profileId,
          hostId: 'local',
          name: request.name,
          prompt: request.prompt,
          plan,
          root: { state: 'planned' },
          members: plan.members.map((member) => ({
            repoId: member.repoId,
            state: 'planned',
            setup: 'pending'
          })),
          agent: { state: 'pending', selected: request.agent }
        },
        null
      )
    })
  }

  stopRootForCleanup(taskId: string): Promise<MultiRepoTask> {
    multiRepoTaskIdSchema.parse(taskId)
    if (this.pending.has(taskId)) {
      return Promise.reject(
        new Error('Wait for the active multi-repo operation before stopping the root')
      )
    }
    return this.serialize(taskId, () => stopRegisteredMultiRepoRoot({ ...this.deps, taskId }))
  }

  private mutate(taskId: string, operation: () => Promise<MultiRepoTask>): Promise<MultiRepoTask> {
    multiRepoTaskIdSchema.parse(taskId)
    if (this.pending.has(taskId)) {
      return Promise.reject(new Error('Another task operation is in progress'))
    }
    return this.serialize(taskId, operation)
  }

  restoreRoot(taskId: string, revision: number): Promise<MultiRepoTask> {
    return this.mutate(taskId, () => restoreMultiRepoRoot({ ...this.deps, taskId, revision }))
  }

  removeRoot(taskId: string, revision: number): Promise<MultiRepoTask> {
    return this.mutate(taskId, () => removeMultiRepoRoot({ ...this.deps, taskId, revision }))
  }

  removeMember(taskId: string, repoId: string, revision: number): Promise<MultiRepoTask> {
    return this.mutate(taskId, () =>
      removeMultiRepoMember({ ...this.deps, taskId, revision, repoId })
    )
  }

  async previewRemoval(taskId: string) {
    if (this.closing || this.pending.has(taskId)) {
      throw new Error('Wait for the active multi-repo operation before previewing cleanup')
    }
    const task = this.deps.journal.get(multiRepoTaskIdSchema.parse(taskId))
    if (!task) {
      throw new Error('Multi-repo task not found')
    }
    const preview = await previewMultiRepoRemoval(task, this.deps.store)
    if (this.closing || this.deps.journal.get(taskId)?.revision !== task.revision) {
      throw new Error('Task changed during cleanup preview; refresh the preview')
    }
    return preview
  }

  run(taskId: string, retryFailedMembers = false): Promise<MultiRepoTask> {
    return this.serialize(taskId, async () => {
      const existing = this.deps.journal.get(taskId)
      if (!existing) {
        throw new Error('Multi-repo task not found')
      }
      let task = await reconcileMultiRepoRootRegistration({
        task: retryFailedMembers
          ? await recoverMultiRepoRootFiles(existing, this.deps.journal)
          : existing,
        journal: this.deps.journal,
        listFolders: () => this.deps.runtime.listFolderWorkspaces(),
        recover: retryFailedMembers
      })
      if (retryFailedMembers) {
        task = await recoverMultiRepoMembers({ ...this.deps, task })
        task = await recoverMultiRepoSetup({ ...this.deps, task, isClosing: () => this.closing })
      }
      const save = (): void => {
        task = this.deps.journal.save(task, task.revision)
      }
      if (task.root.state === 'planned') {
        task.root.state = 'creating'
        save()
        try {
          if ((await realpath(task.plan.parentPath)) !== task.plan.parentPath) {
            throw new Error('Multi-repo parent directory changed')
          }
          await mkdir(task.plan.rootPath)
          for (const [name, content] of Object.entries(multiRepoRootFiles(task))) {
            await writeFile(join(task.plan.rootPath, name), content, { flag: 'wx', mode: 0o600 })
          }
          task.root.state = 'created'
          save()
        } catch (error) {
          task.root.state = 'needs-attention'
          task.root.error = error instanceof Error ? error.message : String(error)
          save()
          return task
        }
      }
      if (task.root.state !== 'created' || this.closing) {
        return task
      }
      if (!task.root.folderWorkspaceId) {
        if (task.root.folderRegistration === 'creating') {
          throw new Error('Recover the root folder registration before retrying')
        }
        task.root.projectGroupId = await this.deps.getProjectGroupId()
        task.root.folderRegistration = 'creating'
        save()
        const folder = await this.deps.runtime.createFolderWorkspace({
          projectGroupId: task.root.projectGroupId,
          name: task.name,
          folderPath: task.plan.rootPath
        })
        task.root.folderWorkspaceId = folder.id
        task.root.folderRegistration = 'registered'
        save()
      }
      for (const member of task.plan.members) {
        if (this.closing) {
          break
        }
        const state = task.members.find((entry) => entry.repoId === member.repoId)
        if (!state) {
          throw new Error('Missing multi-repo member state')
        }
        if (state.state === 'creating' || state.state === 'needs-attention') {
          break
        }
        if (state.state !== 'planned') {
          continue
        }
        state.state = 'creating'
        state.plannedInstanceId ??= randomUUID()
        save()
        try {
          const result = await this.deps.runtime.createManagedWorktree({
            repoSelector: member.repoId,
            name: member.directoryName,
            multiRepoPlacement: { taskId, repoId: member.repoId },
            baseBranch: member.baseCommit,
            compareBaseRef: member.baseRef,
            branchNameOverride: member.branchName,
            setupDecision: member.setupDecision,
            setupOnly: true,
            activate: false,
            awaitTerminalProvisioning: true,
            observeSetupCompletion: true,
            lineage: { parentWorkspace: `folder:${task.root.folderWorkspaceId}` }
          })
          // save() parses a fresh snapshot, so reacquire the mutable member state after each commit.
          const updated = task.members.find((entry) => entry.repoId === member.repoId)
          if (!updated) {
            throw new Error('Missing multi-repo member state')
          }
          if (
            result.worktree.instanceId &&
            result.worktree.instanceId !== updated.plannedInstanceId
          ) {
            throw new Error('Created worktree instance does not match its persisted intent')
          }
          updated.worktreeId = result.worktree.id
          updated.instanceId = result.worktree.instanceId
          updated.setup =
            result.setupReceipt?.state === 'running'
              ? 'running'
              : result.setupReceipt?.state === 'spawn_failed'
                ? 'failed'
                : result.setupReceipt
                  ? 'skipped'
                  : 'pending'
          updated.state = updated.setup === 'skipped' ? 'ready' : 'registered'
          updated.error = result.warning
          updated.setupTerminalHandle = result.setupReceipt?.terminalHandle
          save()
          if (updated.setup === 'running') {
            task = await observeMultiRepoSetup({ ...this.deps, task, repoId: member.repoId })
          }
        } catch (error) {
          const failed = task.members.find((entry) => entry.repoId === member.repoId)
          if (!failed) {
            throw error
          }
          failed.state = 'needs-attention'
          failed.error = error instanceof Error ? error.message : String(error)
          save()
          break
        }
      }
      if (!this.closing) {
        task = await startMultiRepoRootAgent({
          task,
          journal: this.deps.journal,
          launch: this.deps.launchRootAgent
        })
      }
      return task
    })
  }
}
