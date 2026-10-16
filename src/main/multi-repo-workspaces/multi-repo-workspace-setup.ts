import type { MultiRepoTask } from '../../shared/multi-repo-workspaces/multi-repo-workspace-contract'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import type { RuntimeStore } from '../runtime/runtime-store-contract'
import type { MultiRepoWorkspaceStore } from './multi-repo-workspace-store'
import { verifyMultiRepoWorkspaceIdentity } from './multi-repo-workspace-identity'

type SetupRuntime = Pick<OrcaRuntimeService, 'waitForSetupTerminalCompletion'>

export async function observeMultiRepoSetup(args: {
  task: MultiRepoTask
  repoId: string
  journal: MultiRepoWorkspaceStore
  runtime: SetupRuntime
  verifyWorkspace?: () => Promise<void>
}): Promise<MultiRepoTask> {
  const member = args.task.members.find((entry) => entry.repoId === args.repoId)
  if (!member || member.state !== 'registered') {
    throw new Error('Missing registered multi-repo setup state')
  }
  try {
    if (!member.setupTerminalHandle) {
      throw new Error('Setup completion cannot be verified')
    }
    const completion = await args.runtime.waitForSetupTerminalCompletion(
      member.setupTerminalHandle,
      AbortSignal.timeout(60_000)
    )
    if (completion.exitCode !== 0) {
      throw new Error(`Setup did not succeed (exit ${completion.exitCode})`)
    }
    await args.verifyWorkspace?.()
    if (member.setup === 'failed') {
      member.error = undefined
    }
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
  store: Pick<RuntimeStore, 'getWorktreeMeta'>
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
      !member ||
      member.state !== 'registered' ||
      !member.setupTerminalHandle ||
      (member.setup !== 'running' && member.setup !== 'failed')
    ) {
      continue
    }
    const verifyWorkspace = async (): Promise<void> => {
      const id = `${plan.repoId}::${plan.worktreePath}`
      if (
        member.worktreeId !== id ||
        !member.instanceId ||
        args.store.getWorktreeMeta(id)?.instanceId !== member.instanceId
      ) {
        throw new Error('Setup workspace instance changed; completion cannot be applied')
      }
      await verifyMultiRepoWorkspaceIdentity({ ...task.plan, members: [plan] })
    }
    try {
      await verifyWorkspace()
    } catch (error) {
      member.state = 'needs-attention'
      member.error = error instanceof Error ? error.message : String(error)
      task = args.journal.save(task, task.revision)
      continue
    }
    task = await observeMultiRepoSetup({ ...args, task, repoId: plan.repoId, verifyWorkspace })
  }
  return task
}
