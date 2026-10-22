import { reviewFailedMultiRepoSetup } from './multi-repo-workspace-setup-review'

export async function skipMultiRepoSetup(args: Parameters<typeof reviewFailedMultiRepoSetup>[0]) {
  const { task, member, exitCode } = await reviewFailedMultiRepoSetup(args)
  member.setupExitCode = exitCode
  member.setup = exitCode === 0 ? 'succeeded' : 'skipped'
  member.state = 'ready'
  member.error = member.preparation?.warning
  return args.journal.save(task, task.revision)
}
