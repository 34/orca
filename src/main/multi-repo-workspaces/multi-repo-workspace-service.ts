import {
  addMultiRepoMembers,
  syncMultiRepoMembershipFiles
} from './multi-repo-workspace-membership'
import type { MultiRepoWorkspaceServiceDependencies } from './multi-repo-workspace-service-contract'
import { retryMultiRepoSetup } from './multi-repo-workspace-setup-retry'
import { skipMultiRepoSetup } from './multi-repo-workspace-setup-skip'
import { recordMultiRepoPreparation } from './multi-repo-workspace-preparation-receipt'
import { restoreMultiRepoRoot } from './multi-repo-workspace-root-restore'
import {
  removeMultiRepoRoot,
  stopRegisteredMultiRepoRoot
} from './multi-repo-workspace-root-removal'
import { removeMultiRepoMember } from './multi-repo-workspace-removal'
import { previewMultiRepoTaskRemoval } from './multi-repo-workspace-removal-preview'
import { observeMultiRepoSetup, recoverMultiRepoSetup } from './multi-repo-workspace-setup'
import { startMultiRepoRootAgent } from './multi-repo-workspace-agent'
import { prepareMultiRepoWorkspaceSkills } from './multi-repo-workspace-skills'
import { randomUUID } from 'node:crypto'
import { mkdir, realpath, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  multiRepoTaskIdSchema,
  type MultiRepoAddMembersRequest,
  type MultiRepoTask,
  type MultiRepoCreateRequest
} from '../../shared/multi-repo-workspaces/multi-repo-workspace-contract'
import { planMultiRepoWorkspace } from './multi-repo-workspace-plan'
import { bindMultiRepoWorkspaceOwner } from './multi-repo-workspace-placement'
import { recoverMultiRepoMembers } from './multi-repo-workspace-recovery'
import { multiRepoRootFiles, recoverMultiRepoRootFiles } from './multi-repo-workspace-root-files'
import { reconcileMultiRepoRootRegistration } from './multi-repo-workspace-root-registration'

export type { MultiRepoCreateRequest } from '../../shared/multi-repo-workspaces/multi-repo-workspace-contract'

export class MultiRepoWorkspaceService {
  private readonly pending = new Map<string, Promise<MultiRepoTask>>()
  private readonly unbind: () => void
  private closing = false

  constructor(private readonly deps: MultiRepoWorkspaceServiceDependencies) {
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
    const promise = operation().finally(() => this.pending.delete(taskId))
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
      await this.deps.store.flushPendingOrThrowAsync()
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
          createdAt: Date.now(),
          prompt: request.prompt,
          context: request.context,
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

  addMembers(request: MultiRepoAddMembersRequest): Promise<MultiRepoTask> {
    return this.mutate(request.taskId, () => addMultiRepoMembers(this.deps, request))
  }

  stopRootForCleanup(taskId: string): Promise<MultiRepoTask> {
    return this.mutate(taskId, () => stopRegisteredMultiRepoRoot({ ...this.deps, taskId }))
  }

  retrySetup(taskId: string, repoId: string, revision: number): Promise<MultiRepoTask> {
    return this.mutate(taskId, () =>
      retryMultiRepoSetup({ ...this.deps, taskId, repoId, revision, isClosing: () => this.closing })
    )
  }

  skipSetup(taskId: string, repoId: string, revision: number): Promise<MultiRepoTask> {
    return this.mutate(taskId, () => skipMultiRepoSetup({ ...this.deps, taskId, repoId, revision }))
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
    return previewMultiRepoTaskRemoval(
      this.deps,
      multiRepoTaskIdSchema.parse(taskId),
      () => this.closing || this.pending.has(taskId)
    )
  }

  run(taskId: string, retryFailedMembers = false): Promise<MultiRepoTask> {
    return this.serialize(taskId, async () => {
      let existing = this.deps.journal.get(taskId)
      if (!existing) {
        throw new Error('Multi-repo task not found')
      }
      existing = await syncMultiRepoMembershipFiles(existing, this.deps.journal)
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
        await this.deps.store.flushPendingOrThrowAsync()
        task.root.folderWorkspaceId = folder.id
        task.root.folderRegistration = 'registered'
        save()
      }
      task = await prepareMultiRepoWorkspaceSkills(task, this.deps)
      for (const member of task.plan.members) {
        if (this.closing || task.skillInstallation?.state === 'failed') {
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
        state.setupCompletionToken ??= randomUUID()
        state.setupTerminalHandle = `term_${state.setupCompletionToken}`
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
            setupCompletionToken: state.setupCompletionToken,
            onFilesPrepared: (worktree, warning) => {
              task = recordMultiRepoPreparation(task, this.deps.journal, worktree, warning)
            },
            onSetupNotStarted: (worktree, warning) => {
              task = recordMultiRepoPreparation(task, this.deps.journal, worktree, warning, true)
            },
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
          if (
            result.setupReceipt?.terminalHandle &&
            result.setupReceipt.terminalHandle !== updated.setupTerminalHandle
          ) {
            throw new Error('Created setup terminal does not match its persisted intent')
          }
          updated.setupTerminalHandle =
            updated.setup === 'skipped'
              ? undefined
              : (result.setupReceipt?.terminalHandle ?? updated.setupTerminalHandle)
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
      if (!this.closing && task.skillInstallation?.state !== 'failed') {
        task = await startMultiRepoRootAgent({
          task,
          journal: this.deps.journal,
          resolveArguments: this.deps.resolveRootAgentArguments,
          launch: this.deps.launchRootAgent
        })
      }
      return task
    })
  }
}
