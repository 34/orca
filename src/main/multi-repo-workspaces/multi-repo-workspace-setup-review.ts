import type { MultiRepoWorkspaceStore } from './multi-repo-workspace-store'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import type { Repo } from '../../shared/repo-types'
import { verifyMultiRepoMemberRegistration } from './multi-repo-workspace-member-registration'
import { verifyMultiRepoRootOwnership } from './multi-repo-workspace-root-registration'

export async function reviewFailedMultiRepoSetup(args: {
  taskId: string
  repoId: string
  revision: number
  journal: MultiRepoWorkspaceStore
  store: Parameters<typeof verifyMultiRepoMemberRegistration>[2] & {
    getRepo: (id: string) => Repo | undefined
  }
  runtime: Pick<OrcaRuntimeService, 'waitForSetupTerminalCompletion'>
}) {
  const task = args.journal.get(args.taskId)
  if (!task || task.revision !== args.revision) {
    throw new Error('Task changed; refresh before reviewing setup')
  }
  const member = task.members.find((entry) => entry.repoId === args.repoId)
  if (
    task.root.state !== 'created' ||
    member?.state !== 'registered' ||
    member.setup !== 'failed' ||
    member.preparation?.state !== 'finished' ||
    !member.instanceId ||
    !member.setupTerminalHandle
  ) {
    throw new Error('Setup cannot be changed without file preparation and an original setup handle')
  }
  const verify = async () => {
    await verifyMultiRepoRootOwnership(task)
    const repo = args.store.getRepo(args.repoId)
    const registration =
      repo && member.instanceId
        ? await verifyMultiRepoMemberRegistration(task, repo, args.store, member.instanceId)
        : undefined
    if (!registration || registration.worktreeId !== member.worktreeId) {
      throw new Error('Setup member identity changed; setup changes are blocked')
    }
  }
  await verify()
  const completion =
    member.setupExitCode !== undefined
      ? { exitCode: member.setupExitCode }
      : await args.runtime.waitForSetupTerminalCompletion(
          member.setupTerminalHandle,
          AbortSignal.timeout(5_000),
          member.setupCompletionToken
        )
  if (completion.exitCode == null) {
    throw new Error('Setup exit cannot be verified; setup changes are blocked')
  }
  await verify()
  return { task, member, exitCode: completion.exitCode }
}
