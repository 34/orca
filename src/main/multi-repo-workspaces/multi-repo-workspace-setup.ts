import { verifyMultiRepoRootOwnership } from './multi-repo-workspace-root-registration'
import type { MultiRepoTask } from '../../shared/multi-repo-workspaces/multi-repo-workspace-contract'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import type { RuntimeStore } from '../runtime/runtime-store-contract'
import type { MultiRepoWorkspaceStore } from './multi-repo-workspace-store'
import type { Repo } from '../../shared/repo-types'
import type { ProjectRuntimeResolutionStore } from '../local-project-runtime-resolution'
import { verifyMultiRepoMemberRegistration } from './multi-repo-workspace-member-registration'

type SetupRuntime = Pick<OrcaRuntimeService, 'waitForSetupTerminalCompletion'>
type SetupStore = ProjectRuntimeResolutionStore &
  Pick<RuntimeStore, 'getWorktreeMeta'> & { getRepo: (id: string) => Repo | undefined }

async function verifySetupWorkspace(
  task: MultiRepoTask,
  member: MultiRepoTask['members'][number],
  store: SetupStore
): Promise<void> {
  const repo = store.getRepo(member.repoId)
  const registration =
    repo && member.instanceId
      ? await verifyMultiRepoMemberRegistration(task, repo, store, member.instanceId)
      : undefined
  if (!registration || registration.worktreeId !== member.worktreeId) {
    throw new Error('Setup workspace instance changed; completion cannot be applied')
  }
}

export async function observeMultiRepoSetup(args: {
  task: MultiRepoTask
  repoId: string
  journal: MultiRepoWorkspaceStore
  runtime: SetupRuntime
  store: SetupStore
}): Promise<MultiRepoTask> {
  const member = args.task.members.find((entry) => entry.repoId === args.repoId)
  if (!member || member.state !== 'registered') {
    throw new Error('Missing registered multi-repo setup state')
  }
  try {
    await verifySetupWorkspace(args.task, member, args.store)
  } catch (error) {
    member.state = 'needs-attention'
    member.error = error instanceof Error ? error.message : String(error)
    return args.journal.save(args.task, args.task.revision)
  }
  try {
    if (!member.setupTerminalHandle) {
      throw new Error('Setup completion cannot be verified')
    }
    const completion = await args.runtime.waitForSetupTerminalCompletion(
      member.setupTerminalHandle,
      AbortSignal.timeout(60_000),
      member.setupCompletionToken
    )
    await verifySetupWorkspace(args.task, member, args.store)
    if (completion.exitCode !== null) {
      member.setupExitCode = completion.exitCode
    }
    if (completion.exitCode !== 0) {
      throw new Error(`Setup did not succeed (exit ${completion.exitCode})`)
    }
    member.error = member.preparation?.warning
    member.setup = 'succeeded'
    member.state = 'ready'
  } catch (error) {
    member.setup = 'failed'
    member.error = error instanceof Error ? error.message : String(error)
  }
  return args.journal.save(args.task, args.task.revision)
}

export async function recoverMultiRepoSetup(args: {
  task: MultiRepoTask
  journal: MultiRepoWorkspaceStore
  store: SetupStore
  runtime: SetupRuntime
  isClosing: () => boolean
}): Promise<MultiRepoTask> {
  let { task } = args
  for (const plan of task.plan.members) {
    if (args.isClosing()) {
      break
    }
    const member = task.members.find((entry) => entry.repoId === plan.repoId)
    if (
      member?.state === 'registered' &&
      member.setup === 'pending' &&
      member.preparation?.state === 'finished' &&
      (plan.setupDecision === 'skip' || member.setupNotStarted === true) &&
      member.setupExitCode === undefined &&
      (!member.setupTerminalHandle ||
        (member.setupCompletionToken &&
          member.setupTerminalHandle === `term_${member.setupCompletionToken}`))
    ) {
      try {
        await verifyMultiRepoRootOwnership(task)
        await verifySetupWorkspace(task, member, args.store)
        member.setup = 'skipped'
        member.state = 'ready'
        member.setupTerminalHandle = undefined
        member.error = member.preparation.warning
      } catch (error) {
        member.state = 'needs-attention'
        member.error = error instanceof Error ? error.message : String(error)
      }
      task = args.journal.save(task, task.revision)
      continue
    }
    if (
      !member ||
      member.state !== 'registered' ||
      !member.setupTerminalHandle ||
      member.setupExitCode !== undefined ||
      (member.setup !== 'running' &&
        member.setup !== 'failed' &&
        !(
          member.setup === 'pending' &&
          member.preparation?.state === 'finished' &&
          member.setupCompletionToken &&
          member.setupTerminalHandle === `term_${member.setupCompletionToken}`
        ))
    ) {
      continue
    }
    task = await observeMultiRepoSetup({ ...args, task, repoId: plan.repoId })
  }
  return task
}
