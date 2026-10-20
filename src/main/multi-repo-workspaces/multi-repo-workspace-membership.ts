import { lstat, readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type {
  MultiRepoAddMembersRequest,
  MultiRepoTask
} from '../../shared/multi-repo-workspaces/multi-repo-workspace-contract'
import type { MultiRepoWorkspaceServiceDependencies } from './multi-repo-workspace-service-contract'
import type { MultiRepoWorkspaceStore } from './multi-repo-workspace-store'
import { durableWriteTempPath, writeFileDurable } from '../durable-file-write'
import { verifyMultiRepoRootOwnership } from './multi-repo-workspace-root-registration'
import { multiRepoRootFiles } from './multi-repo-workspace-root-files'
import { planMultiRepoWorkspace } from './multi-repo-workspace-plan'

export async function addMultiRepoMembers(
  deps: MultiRepoWorkspaceServiceDependencies,
  request: MultiRepoAddMembersRequest
): Promise<MultiRepoTask> {
  const task = deps.journal.get(request.taskId)
  if (
    !task ||
    task.revision !== request.revision ||
    task.root.state !== 'created' ||
    task.pendingRootPlan ||
    task.members.some((member) => member.state !== 'ready' && member.state !== 'removed')
  ) {
    throw new Error('Wait for creation to finish and refresh before adding repositories')
  }
  await verifyMultiRepoRootOwnership(task)
  const plan = await planMultiRepoWorkspace({
    store: deps.store,
    parentPath: task.plan.parentPath,
    directoryName: basename(task.plan.rootPath),
    existingRoot: task.plan.rootPath,
    members: request.members
  })
  // A running agent retains its initial Git grants; stop it before changing membership.
  await deps.stopRootForCleanup(task)
  await deps.store.flushPendingOrThrowAsync()
  return syncMultiRepoMembershipFiles(
    deps.journal.appendMembers(task.taskId, request.revision, plan.members),
    deps.journal
  )
}

export async function syncMultiRepoMembershipFiles(
  task: MultiRepoTask,
  journal: MultiRepoWorkspaceStore
): Promise<MultiRepoTask> {
  if (!task.pendingRootPlan) {
    return task
  }
  const previous = multiRepoRootFiles({ ...task, plan: task.pendingRootPlan })
  const next = multiRepoRootFiles(task)
  // Ownership is updated last; a crash can leave either generation of each unchanged file.
  const names = Object.keys(next)
    .filter((name) => name !== '.orca-multi-repo.json')
    .concat('.orca-multi-repo.json')
  await verifyMultiRepoRootOwnership({ ...task, plan: task.pendingRootPlan }).catch(async () => {
    await verifyMultiRepoRootOwnership(task)
  })
  for (const name of names) {
    const path = join(task.plan.rootPath, name)
    if (!(await lstat(path)).isFile()) {
      throw new Error(`Generated context file was replaced: ${name}`)
    }
    const actual = await readFile(path)
    if (!actual.equals(Buffer.from(next[name])) && !actual.equals(Buffer.from(previous[name]))) {
      throw new Error(`Generated context file changed; preserve it before continuing: ${name}`)
    }
  }
  for (const name of names) {
    if (!Buffer.from(previous[name]).equals(Buffer.from(next[name]))) {
      await writeFileDurable(
        durableWriteTempPath(join(task.plan.rootPath, name)),
        join(task.plan.rootPath, name),
        next[name]
      )
    }
  }
  return journal.save({ ...task, pendingRootPlan: undefined }, task.revision)
}
