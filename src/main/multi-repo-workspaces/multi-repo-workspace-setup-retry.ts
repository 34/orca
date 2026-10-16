import { randomUUID } from 'node:crypto'
import type { MultiRepoTask } from '../../shared/multi-repo-workspaces/multi-repo-workspace-contract'
import { reviewFailedMultiRepoSetup } from './multi-repo-workspace-setup-review'
import { observeMultiRepoSetup } from './multi-repo-workspace-setup'

export async function retryMultiRepoSetup(
  args: Parameters<typeof reviewFailedMultiRepoSetup>[0] & {
    prepareSetupRetry: (
      task: MultiRepoTask,
      repoId: string,
      token: string
    ) => Promise<() => Promise<string>>
    isClosing: () => boolean
  }
) {
  const { task, member, exitCode } = await reviewFailedMultiRepoSetup(args)
  if (args.isClosing()) {
    throw new Error('Multi-repo profile is closing')
  }
  if (exitCode === 0) {
    member.setup = 'succeeded'
    member.setupExitCode = 0
    member.state = 'ready'
    member.error = member.preparation?.warning
    return args.journal.save(task, task.revision)
  }
  const token = randomUUID()
  const launch = await args.prepareSetupRetry(task, args.repoId, token)
  if (args.isClosing()) {
    throw new Error('Multi-repo profile is closing')
  }
  member.setupCompletionToken = token
  member.setupTerminalHandle = `term_${token}`
  member.setupExitCode = undefined
  member.setup = 'running'
  member.error = 'Setup retry launch is unverified; do not replay it automatically'
  let saved = args.journal.save(task, task.revision)
  // The host retains this handle even when its launch reply never reaches the journal.
  const handle = await launch()
  const updated = saved.members.find((entry) => entry.repoId === args.repoId)
  if (!updated) {
    throw new Error('Missing multi-repo setup member')
  }
  if (handle !== updated.setupTerminalHandle) {
    throw new Error('Setup retry terminal identity changed')
  }
  updated.error = updated.preparation?.warning
  saved = args.journal.save(saved, saved.revision)
  return observeMultiRepoSetup({ ...args, task: saved })
}
